from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.notifications import repository, service
from app.modules.notifications.enums import NotificationStatus
from app.modules.notifications.schemas import (
    NotificationPage,
    NotificationRead,
    ReadAllResult,
    UnreadCount,
)
from app.modules.users.dependencies import get_current_active_user
from app.modules.users.models import User


async def domain_errors() -> AsyncIterator[None]:
    try:
        yield
    except service.NotificationError as error:
        raise HTTPException(error.status_code, error.detail) from error


router = APIRouter(
    prefix="/me/notifications",
    tags=["notifications"],
    dependencies=[Depends(domain_errors)],
)
Session = Annotated[AsyncSession, Depends(get_db_session)]
Actor = Annotated[User, Depends(get_current_active_user)]
Limit = Annotated[int, Query(ge=1, le=100)]


@router.get("", response_model=NotificationPage)
async def list_notifications(
    session: Session,
    actor: Actor,
    status: NotificationStatus | None = None,
    event_name: str | None = None,
    cursor: str | None = None,
    limit: Limit = 50,
):
    return await service.list_notifications(
        session,
        actor.id,
        status=status,
        event_name=event_name,
        cursor=cursor,
        limit=limit,
    )


@router.get("/unread-count", response_model=UnreadCount)
async def unread_count(session: Session, actor: Actor):
    return UnreadCount(count=await repository.unread_count(session, actor.id))


@router.post("/read-all", response_model=ReadAllResult)
async def read_all(session: Session, actor: Actor):
    try:
        updated = await repository.mark_all_read(session, actor.id, datetime.now(UTC))
        await session.commit()
        return ReadAllResult(updated=updated)
    except Exception:
        await session.rollback()
        raise


@router.get("/{notification_id}", response_model=NotificationRead)
async def read_notification(notification_id: UUID, session: Session, actor: Actor):
    return await service.get_notification(session, notification_id, actor.id)


@router.post("/{notification_id}/read", response_model=NotificationRead)
async def mark_notification_read(notification_id: UUID, session: Session, actor: Actor):
    return await service.mark_read(session, notification_id, actor.id)
