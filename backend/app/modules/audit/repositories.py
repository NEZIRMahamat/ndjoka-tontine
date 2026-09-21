from datetime import datetime
from uuid import UUID

from sqlalchemy import Select, and_, or_, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models import AuditEvent


async def append(session: AsyncSession, event: AuditEvent) -> AuditEvent:
    session.add(event)
    await session.flush()
    return event


def filtered_query(
    *,
    event_name: str | None = None,
    resource_type: str | None = None,
    resource_id: UUID | None = None,
    actor_user_id: UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> Select:
    query = select(AuditEvent)
    if event_name:
        query = query.where(AuditEvent.event_name == event_name)
    if resource_type:
        query = query.where(AuditEvent.resource_type == resource_type)
    if resource_id:
        query = query.where(AuditEvent.resource_id == resource_id)
    if actor_user_id:
        query = query.where(AuditEvent.actor_user_id == actor_user_id)
    if date_from:
        query = query.where(AuditEvent.occurred_at >= date_from)
    if date_to:
        query = query.where(AuditEvent.occurred_at <= date_to)
    return query


async def list_events(
    session: AsyncSession,
    query: Select,
    *,
    cursor: tuple[datetime, UUID] | None,
    limit: int,
) -> list[AuditEvent]:
    if cursor:
        query = query.where(
            tuple_(AuditEvent.occurred_at, AuditEvent.id) < tuple_(*cursor)
        )
    rows = await session.scalars(
        query.order_by(AuditEvent.occurred_at.desc(), AuditEvent.id.desc()).limit(
            limit + 1
        )
    )
    return list(rows)


async def find_visible(
    session: AsyncSession, event_id: UUID, condition
) -> AuditEvent | None:
    return await session.scalar(
        select(AuditEvent).where(AuditEvent.id == event_id, condition)
    )


def personal_condition(user_id: UUID):
    return or_(
        AuditEvent.actor_user_id == user_id,
        AuditEvent.subject_user_id == user_id,
    )


def tontine_condition(tontine_id: UUID):
    return AuditEvent.tontine_id == tontine_id


def member_condition(tontine_id: UUID, user_id: UUID):
    return and_(tontine_condition(tontine_id), personal_condition(user_id))


def financial_condition(tontine_id: UUID):
    return and_(
        tontine_condition(tontine_id),
        or_(
            AuditEvent.resource_type.in_(["contribution", "payout"]),
            AuditEvent.event_name.in_(["cycle.activated", "cycle.cancelled"]),
        ),
    )
