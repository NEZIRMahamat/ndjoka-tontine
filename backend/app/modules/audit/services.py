import base64
import json
from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import UUID

from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.request_context import get_request_id
from app.modules.audit import repositories
from app.modules.audit.catalog import EVENT_CATALOG
from app.modules.audit.enums import AuditActorType
from app.modules.audit.models import AuditEvent
from app.modules.audit.schemas import AuditEventList, AuditEventRead
from app.modules.memberships.enums import MembershipRole
from app.modules.users.enums import GlobalRole

FORBIDDEN_KEYS = frozenset(
    {
        "authorization",
        "access_token",
        "id_token",
        "refresh_token",
        "client_secret",
        "password",
        "api_key",
        "cookie",
        "session_cookie",
        "iban",
        "card_number",
        "security_code",
        "cvv",
        "kyc_document",
        "email",
        "auth0_sub",
    }
)


class AuditError(Exception):
    def __init__(self, detail: str, status_code: int) -> None:
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


def _validate_safe(value: Any, path: str = "") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = str(key).lower().replace("-", "_")
            if normalized in FORBIDDEN_KEYS:
                raise AuditError(
                    f"Champ sensible interdit dans l'audit : {path}{key}", 500
                )
            _validate_safe(child, f"{path}{key}.")
    elif isinstance(value, list):
        for child in value:
            _validate_safe(child, path)


def change(before: Any, after: Any) -> dict[str, Any]:
    def value(item):
        return item.value if isinstance(item, Enum) else item

    return {
        "from": jsonable_encoder(value(before)),
        "to": jsonable_encoder(value(after)),
    }


async def record(
    session: AsyncSession,
    *,
    event_name: str,
    resource_type: str,
    resource_id: UUID,
    actor_user_id: UUID | None = None,
    subject_user_id: UUID | None = None,
    tontine_id: UUID | None = None,
    changes: dict[str, Any] | None = None,
    source: str = "api",
) -> AuditEvent:
    event_contract = EVENT_CATALOG.get(event_name)
    if event_contract is None:
        raise AuditError(f"Événement d'audit inconnu : {event_name}", 500)
    if event_contract.resource_type != resource_type:
        raise AuditError("Type de ressource d'audit incohérent", 500)
    safe_changes = jsonable_encoder(changes or {})
    unexpected_fields = set(safe_changes) - event_contract.change_fields
    if unexpected_fields:
        raise AuditError(
            "Champs non autorisés pour cet événement d'audit : "
            + ", ".join(sorted(unexpected_fields)),
            500,
        )
    expected_source = "api" if actor_user_id else "system"
    if source != expected_source:
        raise AuditError("Source et acteur d'audit incohérents", 500)
    safe_context = {"source": expected_source}
    _validate_safe(safe_changes)
    _validate_safe(safe_context)
    return await repositories.append(
        session,
        AuditEvent(
            event_name=event_name,
            actor_type=(
                AuditActorType.USER if actor_user_id else AuditActorType.SYSTEM
            ),
            actor_user_id=actor_user_id,
            subject_user_id=subject_user_id,
            tontine_id=tontine_id,
            resource_type=resource_type,
            resource_id=resource_id,
            changes=safe_changes,
            context=safe_context,
            request_id=get_request_id(),
        ),
    )


def encode_cursor(item: AuditEvent) -> str:
    payload = json.dumps([item.occurred_at.astimezone(UTC).isoformat(), str(item.id)])
    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def decode_cursor(cursor: str | None) -> tuple[datetime, UUID] | None:
    if cursor is None:
        return None
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        occurred, event_id = json.loads(base64.urlsafe_b64decode(padded).decode())
        timestamp = datetime.fromisoformat(occurred)
        if timestamp.tzinfo is None:
            raise ValueError
        return timestamp, UUID(event_id)
    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        raise AuditError("Curseur d'audit invalide", 422) from exc


async def page(session, query, *, cursor: str | None, limit: int) -> AuditEventList:
    rows = await repositories.list_events(
        session, query, cursor=decode_cursor(cursor), limit=limit
    )
    more = len(rows) > limit
    items = rows[:limit]
    return AuditEventList(
        items=[AuditEventRead.model_validate(item) for item in items],
        next_cursor=encode_cursor(items[-1]) if more and items else None,
        limit=limit,
    )


def tontine_visibility(membership, actor):
    if actor.global_role == GlobalRole.PLATFORM_ADMIN:
        return "all"
    if membership is None:
        raise AuditError("Tontine introuvable", 404)
    if membership.role in {MembershipRole.OWNER, MembershipRole.MANAGER}:
        return "all"
    if membership.role == MembershipRole.TREASURER:
        return "financial"
    return "personal"
