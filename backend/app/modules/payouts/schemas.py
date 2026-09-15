from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

from app.modules.contributions.schemas import OptionalNote, OptionalReference
from app.modules.payouts.enums import PayoutStatus

Reason = Annotated[
    str,
    BeforeValidator(lambda v: v.strip() if isinstance(v, str) else v),
    Field(min_length=3, max_length=2000),
]


class PayoutApprove(BaseModel):
    model_config = ConfigDict(extra="forbid")
    approved_amount: Decimal = Field(gt=0, max_digits=18, decimal_places=2)


class PayoutDeclarePaid(BaseModel):
    model_config = ConfigDict(extra="forbid")
    external_reference: OptionalReference = None
    payment_note: OptionalNote = None


class PayoutDispute(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: Reason


class PayoutCancel(PayoutDispute):
    pass


class PayoutResolveDispute(BaseModel):
    model_config = ConfigDict(extra="forbid")
    resolution_note: Reason


class PayoutRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tontine_id: UUID
    cycle_id: UUID
    turn_id: UUID
    beneficiary_membership_id: UUID
    expected_amount: Decimal
    available_amount: Decimal
    approved_amount: Decimal | None
    currency: str
    status: PayoutStatus
    scheduled_for: datetime
    approved_at: datetime | None
    declared_paid_at: datetime | None
    received_at: datetime | None
    disputed_at: datetime | None
    resolved_at: datetime | None
    cancelled_at: datetime | None
    created_at: datetime
    updated_at: datetime
    # Absent (not merely null) for ordinary members other than the beneficiary.
    approved_by_user_id: UUID | None = None
    declared_paid_by_user_id: UUID | None = None
    external_reference: str | None = None
    payment_note: str | None = None
    dispute_reason: str | None = None
    resolved_by_user_id: UUID | None = None
    resolution_note: str | None = None
    cancellation_reason: str | None = None


class PayoutList(BaseModel):
    items: list[PayoutRead]
    total: int
    limit: int
    offset: int


class PayoutSummary(BaseModel):
    cycle_id: UUID
    currency: str
    total: int
    expected_amount: Decimal
    available_amount: Decimal
    pending_amount: Decimal
    ready_amount: Decimal
    approved_amount: Decimal
    declared_paid_amount: Decimal
    received_amount: Decimal
    disputed_amount: Decimal
    cancelled_amount: Decimal
    counts: dict[PayoutStatus, int]
