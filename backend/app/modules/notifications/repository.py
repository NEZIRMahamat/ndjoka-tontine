from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select, tuple_, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notifications.enums import (
    EmailDeliveryStatus,
    NotificationStatus,
    OutboxStatus,
)
from app.modules.notifications.models import (
    EmailDelivery,
    Notification,
    OutboxEvent,
    ResendWebhookEvent,
)


async def enqueue(session: AsyncSession, values: dict) -> OutboxEvent:
    statement = (
        insert(OutboxEvent)
        .values(**values)
        .on_conflict_do_nothing(index_elements=[OutboxEvent.deduplication_key])
        .returning(OutboxEvent)
    )
    item = await session.scalar(statement)
    if item is not None:
        return item
    return await session.scalar(
        select(OutboxEvent).where(
            OutboxEvent.deduplication_key == values["deduplication_key"]
        )
    )


async def create_notification(session: AsyncSession, values: dict) -> Notification:
    statement = (
        insert(Notification)
        .values(**values)
        .on_conflict_do_nothing(index_elements=[Notification.deduplication_key])
        .returning(Notification)
    )
    item = await session.scalar(statement)
    if item is not None:
        return item
    return await session.scalar(
        select(Notification).where(
            Notification.deduplication_key == values["deduplication_key"]
        )
    )


async def create_delivery(session: AsyncSession, values: dict) -> EmailDelivery:
    statement = (
        insert(EmailDelivery)
        .values(**values)
        .on_conflict_do_nothing(index_elements=[EmailDelivery.idempotency_key])
        .returning(EmailDelivery)
    )
    item = await session.scalar(statement)
    if item is not None:
        return item
    return await session.scalar(
        select(EmailDelivery).where(
            EmailDelivery.idempotency_key == values["idempotency_key"]
        )
    )


async def list_for_user(
    session: AsyncSession,
    user_id: UUID,
    *,
    status: NotificationStatus | None,
    event_name: str | None,
    cursor: tuple[datetime, UUID] | None,
    limit: int,
) -> list[Notification]:
    query = select(Notification).where(Notification.recipient_user_id == user_id)
    if status:
        query = query.where(Notification.status == status)
    if event_name:
        query = query.where(Notification.event_name == event_name)
    if cursor:
        query = query.where(
            tuple_(Notification.created_at, Notification.id) < tuple_(*cursor)
        )
    rows = await session.scalars(
        query.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(
            limit + 1
        )
    )
    return list(rows)


async def find_for_user(
    session: AsyncSession, notification_id: UUID, user_id: UUID, *, lock: bool = False
) -> Notification | None:
    query = select(Notification).where(
        Notification.id == notification_id,
        Notification.recipient_user_id == user_id,
    )
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    return await session.scalar(query)


async def unread_count(session: AsyncSession, user_id: UUID) -> int:
    count = await session.scalar(
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.recipient_user_id == user_id,
            Notification.status == NotificationStatus.UNREAD,
        )
    )
    return int(count or 0)


async def mark_all_read(session: AsyncSession, user_id: UUID, now: datetime) -> int:
    result = await session.execute(
        update(Notification)
        .where(
            Notification.recipient_user_id == user_id,
            Notification.status == NotificationStatus.UNREAD,
        )
        .values(status=NotificationStatus.READ, read_at=now)
    )
    return result.rowcount


async def claim_due(session: AsyncSession, limit: int) -> list[OutboxEvent]:
    now = datetime.now(UTC)
    rows = list(
        await session.scalars(
            select(OutboxEvent)
            .where(
                OutboxEvent.status.in_([OutboxStatus.PENDING, OutboxStatus.FAILED]),
                OutboxEvent.next_attempt_at <= now,
            )
            .order_by(OutboxEvent.created_at, OutboxEvent.id)
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
    )
    for row in rows:
        row.status = OutboxStatus.PROCESSING
    await session.flush()
    return rows


async def find_delivery_by_provider_id(
    session: AsyncSession, resend_email_id: str
) -> EmailDelivery | None:
    return await session.scalar(
        select(EmailDelivery)
        .where(EmailDelivery.resend_email_id == resend_email_id)
        .with_for_update()
    )


async def insert_webhook_once(session: AsyncSession, values: dict) -> bool:
    inserted = await session.scalar(
        insert(ResendWebhookEvent)
        .values(**values)
        .on_conflict_do_nothing(index_elements=[ResendWebhookEvent.svix_id])
        .returning(ResendWebhookEvent.id)
    )
    return inserted is not None


async def due_deliveries_for_event(
    session: AsyncSession, keys: list[str]
) -> list[EmailDelivery]:
    if not keys:
        return []
    rows = await session.scalars(
        select(EmailDelivery).where(
            EmailDelivery.idempotency_key.in_(keys),
            EmailDelivery.status.in_(
                [EmailDeliveryStatus.PENDING, EmailDeliveryStatus.FAILED]
            ),
            EmailDelivery.next_attempt_at <= datetime.now(UTC),
        )
    )
    return list(rows)
