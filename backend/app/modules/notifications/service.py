import binascii
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from svix.webhooks import Webhook, WebhookVerificationError

from app.core.config import EmailSettings
from app.core.request_context import get_request_id
from app.modules.memberships.enums import MembershipRole, MembershipStatus
from app.modules.memberships.models import Membership
from app.modules.notifications import repository
from app.modules.notifications.dispatcher import dispatcher
from app.modules.notifications.email import (
    EmailMessage,
    EmailProvider,
    EmailProviderError,
    render_template,
)
from app.modules.notifications.enums import (
    EmailDeliveryStatus,
    NotificationStatus,
    OutboxStatus,
)
from app.modules.notifications.models import Notification, OutboxEvent
from app.modules.notifications.schemas import (
    NotificationPage,
    NotificationRead,
    decode_cursor,
    encode_cursor,
)
from app.modules.users.enums import UserStatus
from app.modules.users.models import User

EVENT_TEMPLATES = {
    "invitation.created": "invitation_created",
    "membership.role_changed": "membership_role_changed",
    "cycle.activated": "cycle_activated",
    "cycle.cancelled": "cycle_cancelled",
    "contribution.due_soon": "contribution_due",
    "contribution.rejected": "contribution_rejected",
    "payout.declared_paid": "payout_declared_paid",
    "payout.disputed": "payout_disputed",
}
FORBIDDEN_PAYLOAD_KEYS = frozenset(
    {
        "access_token",
        "id_token",
        "refresh_token",
        "authorization",
        "password",
        "client_secret",
        "api_key",
        "resend_api_key",
        "resend_webhook_secret",
        "invitation_token",
        "token",
        "iban",
        "card_number",
        "cvv",
    }
)


class NotificationError(Exception):
    def __init__(self, detail: str, status_code: int) -> None:
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


def _validate_payload(value: Any, path: str = "") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = str(key).casefold().replace("-", "_")
            if normalized in FORBIDDEN_PAYLOAD_KEYS:
                raise NotificationError(
                    f"Champ sensible interdit dans l'Outbox : {path}{key}", 500
                )
            _validate_payload(child, f"{path}{key}.")
    elif isinstance(value, list):
        for child in value:
            _validate_payload(child, path)


def action_key(prefix: str) -> str:
    return f"{prefix}:{get_request_id() or uuid4()}"


def recipient(user: User) -> dict[str, str | None]:
    return {"user_id": str(user.id), "email": user.email}


def sender_for_event(event_name: str, settings: EmailSettings) -> str:
    if event_name == "invitation.created":
        return settings.email_contact_address
    return settings.email_from_address


async def tontine_recipients(
    session: AsyncSession,
    tontine_id: UUID,
    *,
    roles: set[MembershipRole] | None = None,
) -> list[dict[str, str | None]]:
    query = (
        select(User)
        .join(Membership, Membership.user_id == User.id)
        .where(
            Membership.tontine_id == tontine_id,
            Membership.status == MembershipStatus.ACTIVE,
            User.status == UserStatus.ACTIVE,
        )
    )
    if roles:
        query = query.where(Membership.role.in_(roles))
    users = await session.scalars(query.order_by(User.id))
    return [recipient(user) for user in users]


async def enqueue_event(
    session: AsyncSession,
    *,
    event_name: str,
    aggregate_type: str,
    aggregate_id: UUID,
    tontine_id: UUID | None,
    recipients: list[dict[str, str | None]],
    template_context: dict[str, object],
    action_path: str,
    deduplication_key: str,
) -> OutboxEvent:
    if event_name not in EVENT_TEMPLATES:
        raise NotificationError("Événement de notification inconnu", 500)
    payload = {
        "recipients": recipients,
        "template_context": template_context,
        "action_path": action_path,
    }
    _validate_payload(payload)
    outbox_event = await repository.enqueue(
        session,
        {
            "event_name": event_name,
            "aggregate_type": aggregate_type,
            "aggregate_id": aggregate_id,
            "tontine_id": tontine_id,
            "payload": payload,
            "deduplication_key": deduplication_key,
        },
    )
    dispatcher.notify_after_commit(session)
    return outbox_event


async def list_notifications(
    session: AsyncSession,
    user_id: UUID,
    *,
    status: NotificationStatus | None,
    event_name: str | None,
    cursor: str | None,
    limit: int,
) -> NotificationPage:
    try:
        decoded = decode_cursor(cursor)
    except ValueError as error:
        raise NotificationError(str(error), 422) from error
    rows = await repository.list_for_user(
        session,
        user_id,
        status=status,
        event_name=event_name,
        cursor=decoded,
        limit=limit,
    )
    more = len(rows) > limit
    items = rows[:limit]
    return NotificationPage(
        items=[NotificationRead.model_validate(item) for item in items],
        next_cursor=(
            encode_cursor(items[-1].created_at, items[-1].id)
            if more and items
            else None
        ),
        limit=limit,
    )


async def get_notification(
    session: AsyncSession, notification_id: UUID, user_id: UUID
) -> Notification:
    item = await repository.find_for_user(session, notification_id, user_id)
    if item is None:
        raise NotificationError("Notification introuvable", 404)
    return item


async def mark_read(
    session: AsyncSession, notification_id: UUID, user_id: UUID
) -> Notification:
    try:
        item = await repository.find_for_user(
            session, notification_id, user_id, lock=True
        )
        if item is None:
            raise NotificationError("Notification introuvable", 404)
        if item.status == NotificationStatus.UNREAD:
            item.status = NotificationStatus.READ
            item.read_at = datetime.now(UTC)
        await session.commit()
        await session.refresh(item)
        return item
    except Exception:
        await session.rollback()
        raise


def _next_retry(attempt: int) -> datetime:
    delay = timedelta(minutes=5 if attempt == 1 else 30)
    return datetime.now(UTC) + delay


async def _process_recipient(
    session: AsyncSession,
    event: OutboxEvent,
    recipient: dict,
    provider: EmailProvider,
    settings: EmailSettings,
) -> tuple[bool, datetime | None]:
    user_id = UUID(recipient["user_id"]) if recipient.get("user_id") else None
    email = recipient.get("email")
    notification = None
    if user_id:
        notification = await repository.create_notification(
            session,
            {
                "recipient_user_id": user_id,
                "tontine_id": event.tontine_id,
                "event_name": event.event_name,
                "payload": event.payload["template_context"],
                "action_path": event.payload["action_path"],
                "deduplication_key": f"{event.deduplication_key}:user:{user_id}",
            },
        )
    if not email:
        return True, None
    notification_part = notification.id if notification else event.id
    idempotency_key = (
        f"ndjoka/{event.event_name}/{notification_part}/{user_id or 'email'}"
    )
    delivery = await repository.create_delivery(
        session,
        {
            "notification_id": notification.id if notification else None,
            "idempotency_key": idempotency_key,
        },
    )
    if delivery.status in {
        EmailDeliveryStatus.ACCEPTED,
        EmailDeliveryStatus.DELIVERED,
        EmailDeliveryStatus.BOUNCED,
        EmailDeliveryStatus.COMPLAINED,
        EmailDeliveryStatus.DEAD,
    }:
        return True, None
    context = {
        **event.payload["template_context"],
        "action_url": (f"{settings.frontend_base_url}{event.payload['action_path']}"),
    }
    try:
        subject, text, html = render_template(
            EVENT_TEMPLATES[event.event_name], context
        )
        result = await provider.send(
            EmailMessage(
                to=email,
                subject=subject,
                text=text,
                html=html,
                from_address=sender_for_event(event.event_name, settings),
            ),
            idempotency_key=idempotency_key,
        )
    except EmailProviderError as error:
        delivery.attempt_count += 1
        delivery.last_error_code = error.code
        if error.temporary and delivery.attempt_count < 3:
            delivery.status = EmailDeliveryStatus.FAILED
            delivery.next_attempt_at = _next_retry(delivery.attempt_count)
            return False, delivery.next_attempt_at
        delivery.status = EmailDeliveryStatus.DEAD
        return False, None
    delivery.attempt_count += 1
    delivery.status = EmailDeliveryStatus.ACCEPTED
    delivery.resend_email_id = result.provider_id
    delivery.accepted_at = datetime.now(UTC)
    delivery.last_error_code = None
    return True, None


async def process_outbox_once(
    session: AsyncSession,
    provider: EmailProvider,
    settings: EmailSettings,
    *,
    limit: int = 50,
) -> int:
    processed = 0
    try:
        events = await repository.claim_due(session, limit)
        for event in events:
            event.attempt_count += 1
            results = [
                await _process_recipient(session, event, recipient, provider, settings)
                for recipient in event.payload.get("recipients", [])
            ]
            retry_dates = [date for done, date in results if not done and date]
            if any(not done and date is None for done, date in results):
                event.status = OutboxStatus.DEAD
            elif retry_dates:
                event.status = OutboxStatus.FAILED
                event.next_attempt_at = min(retry_dates)
            else:
                event.status = OutboxStatus.PROCESSED
                event.processed_at = datetime.now(UTC)
                processed += 1
        await session.commit()
        return processed
    except Exception:
        await session.rollback()
        raise


async def process_resend_webhook(
    session: AsyncSession,
    raw_body: bytes,
    headers: dict[str, str],
    secret: str,
) -> bool:
    try:
        payload = Webhook(secret).verify(raw_body, headers)
    except (WebhookVerificationError, binascii.Error, ValueError) as error:
        raise NotificationError("Signature Resend invalide", 400) from error
    event_type = payload.get("type")
    if event_type not in {
        "email.delivered",
        "email.bounced",
        "email.complained",
        "email.failed",
    }:
        return True
    data = payload.get("data") or {}
    resend_email_id = data.get("email_id")
    try:
        occurred_at = datetime.fromisoformat(
            payload["created_at"].replace("Z", "+00:00")
        )
    except (KeyError, TypeError, ValueError) as error:
        raise NotificationError("Payload Resend invalide", 400) from error
    inserted = await repository.insert_webhook_once(
        session,
        {
            "svix_id": headers["svix-id"],
            "event_type": event_type,
            "resend_email_id": resend_email_id,
            "provider_occurred_at": occurred_at,
        },
    )
    if not inserted:
        await session.rollback()
        return False
    if resend_email_id:
        delivery = await repository.find_delivery_by_provider_id(
            session, resend_email_id
        )
        if delivery:
            mapping = {
                "email.delivered": EmailDeliveryStatus.DELIVERED,
                "email.bounced": EmailDeliveryStatus.BOUNCED,
                "email.complained": EmailDeliveryStatus.COMPLAINED,
                "email.failed": EmailDeliveryStatus.FAILED,
            }
            delivery.status = mapping[event_type]
            if event_type == "email.delivered":
                delivery.delivered_at = occurred_at
            elif event_type == "email.failed":
                delivery.last_error_code = "provider_failed"
    await session.commit()
    return True
