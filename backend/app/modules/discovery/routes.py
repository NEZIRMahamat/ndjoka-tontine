from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.cycles.enums import CycleFrequency
from app.modules.discovery import services
from app.modules.discovery.schemas import (
    DiscoveredMemberList,
    DiscoveredTontine,
    DiscoveryList,
)
from app.modules.memberships.schemas import MembershipRead
from app.modules.memberships.services import MembershipError
from app.modules.users.dependencies import get_current_active_user
from app.modules.users.models import User


async def domain_errors() -> AsyncIterator[None]:
    try:
        yield
    except MembershipError as error:
        raise HTTPException(error.status_code, error.detail) from error


router = APIRouter(
    prefix="/discovery",
    tags=["découverte"],
    dependencies=[Depends(domain_errors)],
    responses={
        401: {"description": "Token absent ou invalide"},
        403: {"description": "Compte non actif"},
    },
)
Session = Annotated[AsyncSession, Depends(get_db_session)]
Actor = Annotated[User, Depends(get_current_active_user)]


@router.get(
    "/tontines",
    response_model=DiscoveryList,
    summary="Découvrir des tontines correspondant à mon profil",
)
async def discover(
    session: Session,
    actor: Actor,
    search: Annotated[str | None, Query(max_length=120)] = None,
    frequency: CycleFrequency | None = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    eligible_only: Annotated[bool, Query()] = False,
) -> DiscoveryList:
    return await services.discover_tontines(
        session,
        actor,
        search=search,
        frequency=frequency,
        limit=limit,
        offset=offset,
        eligible_only=eligible_only,
    )


@router.post(
    "/tontines/{tontine_id}/join",
    response_model=MembershipRead,
    status_code=status.HTTP_201_CREATED,
    summary="Rejoindre une tontine ouverte",
    responses={
        404: {"description": "Tontine introuvable ou non ouverte"},
        409: {"description": "Adhésion impossible"},
    },
)
async def join(session: Session, actor: Actor, tontine_id: UUID) -> MembershipRead:
    membership = await services.join_discoverable_tontine(session, actor, tontine_id)
    return MembershipRead.model_validate(membership)


@router.get(
    "/tontines/{tontine_id}",
    response_model=DiscoveredTontine,
    summary="Consulter une tontine ouverte",
    responses={404: {"description": "Tontine introuvable ou non ouverte"}},
)
async def read_tontine(
    session: Session, actor: Actor, tontine_id: UUID
) -> DiscoveredTontine:
    return await services.get_discoverable_tontine(session, actor, tontine_id)


@router.get(
    "/tontines/{tontine_id}/members",
    response_model=DiscoveredMemberList,
    summary="Voir les membres d'une tontine ouverte avant d'adhérer",
    responses={404: {"description": "Tontine introuvable ou non ouverte"}},
)
async def read_members(
    session: Session, actor: Actor, tontine_id: UUID
) -> DiscoveredMemberList:
    return await services.list_discoverable_members(session, actor, tontine_id)
