from collections.abc import AsyncIterator
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.audit import repositories, services
from app.modules.audit.models import AuditEvent
from app.modules.audit.schemas import AuditEventList, AuditEventRead
from app.modules.memberships import repositories as membership_repositories
from app.modules.users.dependencies import (
    get_current_active_user,
    get_current_platform_admin,
)
from app.modules.users.models import User


async def domain_errors() -> AsyncIterator[None]:
    try:
        yield
    except services.AuditError as error:
        raise HTTPException(error.status_code, error.detail) from error


router = APIRouter(
    tags=["audit"],
    dependencies=[Depends(domain_errors)],
    responses={
        401: {"description": "Token absent ou invalide"},
        403: {"description": "Consultation non autorisée"},
        404: {"description": "Événement ou tontine inaccessible"},
        422: {"description": "Filtre ou curseur invalide"},
    },
)
Session = Annotated[AsyncSession, Depends(get_db_session)]
Actor = Annotated[User, Depends(get_current_active_user)]
Admin = Annotated[User, Depends(get_current_platform_admin)]
Limit = Annotated[int, Query(ge=1, le=100)]


def query_from_filters(
    event_name: str | None,
    resource_type: str | None,
    resource_id: UUID | None,
    actor_user_id: UUID | None,
    date_from: datetime | None,
    date_to: datetime | None,
):
    if (date_from and date_from.tzinfo is None) or (date_to and date_to.tzinfo is None):
        raise services.AuditError("Les dates doivent inclure un fuseau horaire", 422)
    if date_from and date_to and date_from > date_to:
        raise services.AuditError("date_from doit précéder date_to", 422)
    return repositories.filtered_query(
        event_name=event_name,
        resource_type=resource_type,
        resource_id=resource_id,
        actor_user_id=actor_user_id,
        date_from=date_from,
        date_to=date_to,
    )


async def listing(
    session: Session,
    condition,
    limit: int,
    cursor: str | None,
    event_name: str | None,
    resource_type: str | None,
    resource_id: UUID | None,
    actor_user_id: UUID | None,
    date_from: datetime | None,
    date_to: datetime | None,
):
    query = query_from_filters(
        event_name, resource_type, resource_id, actor_user_id, date_from, date_to
    ).where(condition)
    return await services.page(session, query, cursor=cursor, limit=limit)


@router.get(
    "/me/audit-events",
    response_model=AuditEventList,
    summary="Consulter mon historique métier",
)
async def list_personal(
    session: Session,
    actor: Actor,
    limit: Limit = 50,
    cursor: str | None = None,
    event_name: str | None = None,
    resource_type: str | None = None,
    resource_id: UUID | None = None,
    actor_user_id: UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    return await listing(
        session,
        repositories.personal_condition(actor.id),
        limit,
        cursor,
        event_name,
        resource_type,
        resource_id,
        actor_user_id,
        date_from,
        date_to,
    )


@router.get(
    "/me/audit-events/{event_id}",
    response_model=AuditEventRead,
    summary="Consulter un événement personnel",
)
async def read_personal(event_id: UUID, session: Session, actor: Actor):
    item = await repositories.find_visible(
        session, event_id, repositories.personal_condition(actor.id)
    )
    if item is None:
        raise services.AuditError("Événement d'audit introuvable", 404)
    return AuditEventRead.model_validate(item)


async def tontine_scope(session, tontine_id, actor):
    membership = await membership_repositories.find_membership(
        session, tontine_id, actor.id, active_only=True
    )
    visibility = services.tontine_visibility(membership, actor)
    if visibility == "all":
        return repositories.tontine_condition(tontine_id)
    personal = repositories.member_condition(tontine_id, actor.id)
    if visibility == "financial":
        return or_(personal, repositories.financial_condition(tontine_id))
    return personal


@router.get(
    "/tontines/{tontine_id}/audit-events",
    response_model=AuditEventList,
    summary="Consulter l'historique autorisé d'une tontine",
)
async def list_tontine(
    tontine_id: UUID,
    session: Session,
    actor: Actor,
    limit: Limit = 50,
    cursor: str | None = None,
    event_name: str | None = None,
    resource_type: str | None = None,
    resource_id: UUID | None = None,
    actor_user_id: UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    return await listing(
        session,
        await tontine_scope(session, tontine_id, actor),
        limit,
        cursor,
        event_name,
        resource_type,
        resource_id,
        actor_user_id,
        date_from,
        date_to,
    )


@router.get(
    "/tontines/{tontine_id}/audit-events/{event_id}",
    response_model=AuditEventRead,
    summary="Consulter un événement autorisé d'une tontine",
)
async def read_tontine(
    tontine_id: UUID, event_id: UUID, session: Session, actor: Actor
):
    item = await repositories.find_visible(
        session, event_id, await tontine_scope(session, tontine_id, actor)
    )
    if item is None:
        raise services.AuditError("Événement d'audit introuvable", 404)
    return AuditEventRead.model_validate(item)


@router.get(
    "/admin/audit-events",
    response_model=AuditEventList,
    summary="Consulter l'audit global",
)
async def list_global(
    session: Session,
    admin: Admin,
    limit: Limit = 50,
    cursor: str | None = None,
    event_name: str | None = None,
    resource_type: str | None = None,
    resource_id: UUID | None = None,
    actor_user_id: UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    del admin
    return await services.page(
        session,
        query_from_filters(
            event_name, resource_type, resource_id, actor_user_id, date_from, date_to
        ),
        cursor=cursor,
        limit=limit,
    )


@router.get(
    "/admin/audit-events/{event_id}",
    response_model=AuditEventRead,
    summary="Consulter un événement global",
)
async def read_global(event_id: UUID, session: Session, admin: Admin):
    del admin
    item = await session.get(AuditEvent, event_id)
    if item is None:
        raise services.AuditError("Événement d'audit introuvable", 404)
    return AuditEventRead.model_validate(item)
