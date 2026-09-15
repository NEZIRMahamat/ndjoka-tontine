from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.cycles.services import CycleError, get_cycle
from app.modules.memberships.dependencies import CurrentMembership
from app.modules.payouts import repositories, services
from app.modules.payouts.enums import PayoutStatus
from app.modules.payouts.schemas import (
    PayoutApprove,
    PayoutCancel,
    PayoutDeclarePaid,
    PayoutDispute,
    PayoutList,
    PayoutRead,
    PayoutResolveDispute,
    PayoutSummary,
)
from app.modules.users.dependencies import get_current_active_user
from app.modules.users.models import User


async def domain_errors() -> AsyncIterator[None]:
    try:
        yield
    except CycleError as error:
        raise HTTPException(error.status_code, error.detail) from error


router = APIRouter(
    tags=["payouts"],
    dependencies=[Depends(domain_errors)],
    responses={
        401: {"description": "Token absent ou invalide"},
        403: {"description": "Rôle ou bénéficiaire non autorisé"},
        404: {"description": "Ressource inexistante ou inaccessible"},
        409: {"description": "Transition ou montant impossible"},
    },
)
Session = Annotated[AsyncSession, Depends(get_db_session)]
Actor = Annotated[User, Depends(get_current_active_user)]
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]
BASE = "/tontines/{tontine_id}/cycles/{cycle_id}/payouts"


@router.post(
    BASE + "/generate",
    response_model=PayoutSummary,
    summary="Générer les versements (idempotent)",
)
async def generate(tontine_id: UUID, cycle_id: UUID, session: Session, actor: Actor):
    await services.generate(session, tontine_id, cycle_id, actor)
    return await services.summary(session, cycle_id)


@router.get(
    BASE,
    response_model=PayoutList,
    response_model_exclude_unset=True,
    summary="Lister les versements du cycle",
)
async def list_cycle(
    tontine_id: UUID,
    cycle_id: UUID,
    session: Session,
    membership: CurrentMembership,
    limit: Limit = 20,
    offset: Offset = 0,
    status: PayoutStatus | None = None,
):
    await get_cycle(session, tontine_id, cycle_id)
    items, total = await repositories.list_items(
        session, cycle_id=cycle_id, status=status, limit=limit, offset=offset
    )
    return PayoutList(
        items=[services.read_item(item, membership) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    BASE + "/summary",
    response_model=PayoutSummary,
    summary="Synthétiser les versements",
)
async def summary(
    tontine_id: UUID, cycle_id: UUID, session: Session, membership: CurrentMembership
):
    await get_cycle(session, tontine_id, cycle_id)
    return await services.summary(session, cycle_id)


@router.get(
    "/me/payouts",
    response_model=PayoutList,
    response_model_exclude_unset=True,
    summary="Lister mes versements bénéficiaires",
)
async def list_mine(
    session: Session,
    actor: Actor,
    limit: Limit = 20,
    offset: Offset = 0,
    status: PayoutStatus | None = None,
):
    items, total = await repositories.list_items(
        session, user_id=actor.id, status=status, limit=limit, offset=offset
    )
    results = []
    for item in items:
        membership = await services.membership_for(session, item.tontine_id, actor)
        results.append(services.read_item(item, membership))
    return PayoutList(items=results, total=total, limit=limit, offset=offset)


@router.get(
    "/payouts/{payout_id}",
    response_model=PayoutRead,
    response_model_exclude_unset=True,
    summary="Consulter un versement",
)
async def read(payout_id: UUID, session: Session, actor: Actor):
    item, membership, _ = await services.get_payout(session, payout_id, actor)
    return services.read_item(item, membership)


@router.post(
    "/payouts/{payout_id}/refresh-readiness",
    response_model=PayoutRead,
    response_model_exclude_unset=True,
    summary="Recalculer l’éligibilité",
)
async def refresh_readiness(payout_id: UUID, session: Session, actor: Actor):
    return await services.transition(session, payout_id, actor, "refresh-readiness")


@router.post(
    "/payouts/{payout_id}/approve",
    response_model=PayoutRead,
    response_model_exclude_unset=True,
    summary="Approuver le montant total",
)
async def approve(
    payout_id: UUID, session: Session, actor: Actor, payload: PayoutApprove
):
    return await services.transition(session, payout_id, actor, "approve", payload)


@router.post(
    "/payouts/{payout_id}/declare-paid",
    response_model=PayoutRead,
    response_model_exclude_unset=True,
    summary="Déclarer le transfert manuel",
)
async def declare_paid(
    payout_id: UUID, session: Session, actor: Actor, payload: PayoutDeclarePaid
):
    return await services.transition(session, payout_id, actor, "declare-paid", payload)


@router.post(
    "/payouts/{payout_id}/confirm-receipt",
    response_model=PayoutRead,
    response_model_exclude_unset=True,
    summary="Confirmer la réception (bénéficiaire)",
)
async def confirm_receipt(payout_id: UUID, session: Session, actor: Actor):
    return await services.transition(session, payout_id, actor, "confirm-receipt")


@router.post(
    "/payouts/{payout_id}/dispute",
    response_model=PayoutRead,
    response_model_exclude_unset=True,
    summary="Contester la réception (bénéficiaire)",
)
async def dispute(
    payout_id: UUID, session: Session, actor: Actor, payload: PayoutDispute
):
    return await services.transition(session, payout_id, actor, "dispute", payload)


@router.post(
    "/payouts/{payout_id}/resolve-dispute",
    response_model=PayoutRead,
    response_model_exclude_unset=True,
    summary="Résoudre une contestation avec justification",
)
async def resolve_dispute(
    payout_id: UUID, session: Session, actor: Actor, payload: PayoutResolveDispute
):
    return await services.transition(
        session, payout_id, actor, "resolve-dispute", payload
    )


@router.post(
    "/payouts/{payout_id}/cancel",
    response_model=PayoutRead,
    response_model_exclude_unset=True,
    summary="Annuler avant transfert avec motif",
)
async def cancel(
    payout_id: UUID, session: Session, actor: Actor, payload: PayoutCancel
):
    return await services.transition(session, payout_id, actor, "cancel", payload)
