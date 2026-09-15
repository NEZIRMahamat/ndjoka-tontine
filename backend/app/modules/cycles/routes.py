from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.contributions.services import ContributionError
from app.modules.cycles import services
from app.modules.cycles.schemas import (
    CycleCreate,
    CycleList,
    CycleRead,
    CycleUpdate,
    TurnOrderUpdate,
)
from app.modules.memberships.dependencies import CurrentMembership
from app.modules.tontines.models import Tontine
from app.modules.users.dependencies import get_current_active_user
from app.modules.users.models import User


async def domain_errors() -> AsyncIterator[None]:
    try:
        yield
    except (services.CycleError, ContributionError) as error:
        raise HTTPException(error.status_code, error.detail) from error


router = APIRouter(
    tags=["cycles"],
    dependencies=[Depends(domain_errors)],
    responses={
        401: {"description": "Token absent ou invalide"},
        403: {"description": "Rôle interne insuffisant"},
        404: {"description": "Ressource introuvable ou inaccessible"},
        409: {"description": "Transition métier impossible"},
    },
)
Session = Annotated[AsyncSession, Depends(get_db_session)]
Actor = Annotated[User, Depends(get_current_active_user)]


async def tontine_or_404(session: AsyncSession, tontine_id: UUID) -> Tontine:
    tontine = await session.get(Tontine, tontine_id)
    if tontine is None:
        raise services.CycleError("Tontine introuvable", 404)
    return tontine


def cycle_path(tontine_id: UUID, cycle_id: UUID) -> str:
    return f"/api/v1/tontines/{tontine_id}/cycles/{cycle_id}"


@router.post(
    "/tontines/{tontine_id}/cycles",
    response_model=CycleRead,
    status_code=201,
    summary="Créer un cycle en brouillon",
)
async def create(
    tontine_id: UUID,
    payload: CycleCreate,
    session: Session,
    actor: Actor,
    membership: CurrentMembership,
    response: Response,
) -> CycleRead:
    cycle = await services.create_cycle(
        session, actor, membership, await tontine_or_404(session, tontine_id), payload
    )
    response.headers["Location"] = cycle_path(tontine_id, cycle.id)
    return CycleRead.model_validate(cycle)


@router.get(
    "/tontines/{tontine_id}/cycles",
    response_model=CycleList,
    summary="Lister les cycles",
)
async def list_all(
    tontine_id: UUID,
    session: Session,
    membership: CurrentMembership,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CycleList:
    del membership
    items, total = await services.list_cycles(
        session, tontine_id, limit=limit, offset=offset
    )
    return CycleList(
        items=[CycleRead.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/tontines/{tontine_id}/cycles/{cycle_id}",
    response_model=CycleRead,
    summary="Consulter un cycle et son calendrier",
)
async def read(
    tontine_id: UUID, cycle_id: UUID, session: Session, membership: CurrentMembership
) -> CycleRead:
    del membership
    return CycleRead.model_validate(
        await services.get_cycle(session, tontine_id, cycle_id)
    )


@router.patch(
    "/tontines/{tontine_id}/cycles/{cycle_id}",
    response_model=CycleRead,
    summary="Modifier un cycle en brouillon",
)
async def update(
    tontine_id: UUID,
    cycle_id: UUID,
    payload: CycleUpdate,
    session: Session,
    membership: CurrentMembership,
) -> CycleRead:
    return CycleRead.model_validate(
        await services.update_cycle(session, tontine_id, cycle_id, membership, payload)
    )


@router.post(
    "/tontines/{tontine_id}/cycles/{cycle_id}/turns/generate",
    response_model=CycleRead,
    summary="Générer le calendrier des bénéficiaires",
)
async def generate(
    tontine_id: UUID, cycle_id: UUID, session: Session, membership: CurrentMembership
) -> CycleRead:
    return CycleRead.model_validate(
        await services.generate_turns(session, tontine_id, cycle_id, membership)
    )


@router.put(
    "/tontines/{tontine_id}/cycles/{cycle_id}/turns",
    response_model=CycleRead,
    summary="Réordonner tous les bénéficiaires",
)
async def reorder(
    tontine_id: UUID,
    cycle_id: UUID,
    payload: TurnOrderUpdate,
    session: Session,
    membership: CurrentMembership,
) -> CycleRead:
    return CycleRead.model_validate(
        await services.reorder_turns(session, tontine_id, cycle_id, membership, payload)
    )


@router.post(
    "/tontines/{tontine_id}/cycles/{cycle_id}/schedule",
    response_model=CycleRead,
    summary="Planifier un cycle",
)
async def schedule(
    tontine_id: UUID, cycle_id: UUID, session: Session, membership: CurrentMembership
) -> CycleRead:
    return CycleRead.model_validate(
        await services.schedule_cycle(session, tontine_id, cycle_id, membership)
    )


@router.post(
    "/tontines/{tontine_id}/cycles/{cycle_id}/activate",
    response_model=CycleRead,
    summary="Activer un cycle et générer ses cotisations",
)
async def activate(
    tontine_id: UUID, cycle_id: UUID, session: Session, membership: CurrentMembership
) -> CycleRead:
    return CycleRead.model_validate(
        await services.activate_cycle(session, tontine_id, cycle_id, membership)
    )


@router.post(
    "/tontines/{tontine_id}/cycles/{cycle_id}/complete",
    response_model=CycleRead,
    summary="Terminer un cycle actif",
)
async def complete(
    tontine_id: UUID, cycle_id: UUID, session: Session, membership: CurrentMembership
) -> CycleRead:
    return CycleRead.model_validate(
        await services.complete_cycle(session, tontine_id, cycle_id, membership)
    )


@router.post(
    "/tontines/{tontine_id}/cycles/{cycle_id}/cancel",
    response_model=CycleRead,
    summary="Annuler un cycle",
)
async def cancel(
    tontine_id: UUID, cycle_id: UUID, session: Session, membership: CurrentMembership
) -> CycleRead:
    return CycleRead.model_validate(
        await services.cancel_cycle(session, tontine_id, cycle_id, membership)
    )
