from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class FeeTier(BaseModel):
    label: str
    rate: str
    minimum: str | None
    cap: str | None


class FeeQuoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    contribution_amount: Decimal
    members: int
    gross_amount: Decimal
    fee_per_contribution: Decimal
    fee_total: Decimal
    effective_rate: Decimal
    solidarity_fund_share: Decimal
    platform_share: Decimal
    net_amount: Decimal
    payment_methods: list[str]


class FeeScheduleRead(BaseModel):
    tiers: list[FeeTier]
    solidarity_share: str
    card_limit: Decimal
    notice_days: int
