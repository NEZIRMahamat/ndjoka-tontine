from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.contributions import repositories, services
from app.modules.contributions.enums import EffectiveContributionStatus
from app.modules.contributions.schemas import (
    ContributionDeclare,
    ContributionList,
    ContributionRead,
    ContributionReject,
    ContributionSummary,
)
from app.modules.cycles import services as cycle_services
from app.modules.memberships.dependencies import CurrentMembership
from app.modules.users.dependencies import get_current_active_user
from app.modules.users.models import User


async def domain_errors() -> AsyncIterator[None]:
    try:
        yield
    except (services.ContributionError, cycle_services.CycleError) as error:
        raise HTTPException(error.status_code, error.detail) from error


router = APIRouter(
    tags=["contributions"],
    dependencies=[Depends(domain_errors)],
    responses={
        401: {"description": "Token absent ou invalide"},
        403: {"description": "Rôle ou acteur non autorisé"},
        404: {"description": "Ressource introuvable ou inaccessible"},
        409: {"description": "Transition métier impossible"},
    },
)
Session = Annotated[AsyncSession, Depends(get_db_session)]
Actor = Annotated[User, Depends(get_current_active_user)]


def read_item(item) -> ContributionRead:
    return ContributionRead.model_validate(
        {**item.__dict__, "effective_status": services.effective_status(item)}
    )


@router.post(
    "/tontines/{tontine_id}/cycles/{cycle_id}/contributions/generate",
    response_model=ContributionSummary,
    summary="Générer les cotisations attendues",
)
async def generate(
    tontine_id: UUID, cycle_id: UUID, session: Session, membership: CurrentMembership
) -> ContributionSummary:
    cycle = await cycle_services.get_cycle(session, tontine_id, cycle_id, lock=True)
    await services.generate_contributions(session, cycle, membership)
    return await services.summary(session, cycle_id)


@router.get(
    "/tontines/{tontine_id}/cycles/{cycle_id}/contributions",
    response_model=ContributionList,
    summary="Lister toutes les cotisations d'un cycle",
)
async def list_cycle(
    tontine_id: UUID,
    cycle_id: UUID,
    session: Session,
    membership: CurrentMembership,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    status: EffectiveContributionStatus | None = None,
) -> ContributionList:
    services.require_financial_role(membership)
    await cycle_services.get_cycle(session, tontine_id, cycle_id)
    items, total = await repositories.list_cycle_contributions(
        session,
        cycle_id,
        limit=limit,
        offset=offset,
        status=status,
        now=datetime.now(UTC),
    )
    return ContributionList(
        items=[read_item(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/tontines/{tontine_id}/cycles/{cycle_id}/contributions/summary",
    response_model=ContributionSummary,
    summary="Synthétiser les cotisations d'un cycle",
)
async def cycle_summary(
    tontine_id: UUID, cycle_id: UUID, session: Session, membership: CurrentMembership
) -> ContributionSummary:
    services.require_financial_role(membership)
    await cycle_services.get_cycle(session, tontine_id, cycle_id)
    return await services.summary(session, cycle_id)


@router.get(
    "/me/contributions",
    response_model=ContributionList,
    summary="Lister mes cotisations",
)
async def list_mine(
    session: Session,
    actor: Actor,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    status: EffectiveContributionStatus | None = None,
) -> ContributionList:
    items, total = await repositories.list_user_contributions(
        session,
        actor.id,
        limit=limit,
        offset=offset,
        status=status,
        now=datetime.now(UTC),
    )
    return ContributionList(
        items=[read_item(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/contributions/{contribution_id}",
    response_model=ContributionRead,
    summary="Consulter une cotisation autorisée",
)
async def read(
    contribution_id: UUID, session: Session, actor: Actor
) -> ContributionRead:
    item, _ = await services.get_contribution(session, contribution_id, actor)
    return read_item(item)


@router.post(
    "/contributions/{contribution_id}/declare",
    response_model=ContributionRead,
    summary="Déclarer ma cotisation",
)
async def declare(
    contribution_id: UUID, payload: ContributionDeclare, session: Session, actor: Actor
) -> ContributionRead:
    return read_item(
        await services.declare_contribution(session, contribution_id, actor, payload)
    )


@router.post(
    "/contributions/{contribution_id}/confirm",
    response_model=ContributionRead,
    summary="Confirmer une cotisation déclarée",
)
async def confirm(
    contribution_id: UUID, session: Session, actor: Actor
) -> ContributionRead:
    return read_item(
        await services.confirm_contribution(session, contribution_id, actor)
    )


@router.post(
    "/contributions/{contribution_id}/reject",
    response_model=ContributionRead,
    summary="Rejeter une cotisation déclarée",
)
async def reject(
    contribution_id: UUID, payload: ContributionReject, session: Session, actor: Actor
) -> ContributionRead:
    return read_item(
        await services.reject_contribution(session, contribution_id, actor, payload)
    )
