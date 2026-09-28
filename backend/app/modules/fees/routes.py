from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.modules.fees import pricing
from app.modules.fees.schemas import FeeQuoteRead, FeeScheduleRead, FeeTier
from app.modules.users.dependencies import get_current_active_user

router = APIRouter(
    prefix="/fees",
    tags=["frais"],
    dependencies=[Depends(get_current_active_user)],
    responses={401: {"description": "Token absent ou invalide"}},
)


@router.get("/schedule", response_model=FeeScheduleRead, summary="Barème en vigueur")
async def schedule() -> FeeScheduleRead:
    return FeeScheduleRead(
        tiers=[FeeTier(**tier) for tier in pricing.FEE_TIERS],
        solidarity_share="1/6",
        card_limit=pricing.CARD_LIMIT,
        notice_days=30,
    )


@router.get(
    "/quote",
    response_model=FeeQuoteRead,
    summary="Simuler les frais d'un tour",
)
async def quote(
    contribution_amount: Annotated[
        Decimal, Query(gt=0, max_digits=18, decimal_places=2)
    ],
    members: Annotated[int, Query(ge=1, le=10_000)],
) -> FeeQuoteRead:
    return FeeQuoteRead.model_validate(pricing.quote(contribution_amount, members))
