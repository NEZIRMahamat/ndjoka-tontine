from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

from app.modules.contributions.enums import (
    ContributionStatus,
    EffectiveContributionStatus,
)


def optional_text(value: object) -> object:
    if isinstance(value, str):
        return value.strip() or None
    return value


OptionalReference = Annotated[
    str | None, Field(max_length=255), BeforeValidator(optional_text)
]
OptionalNote = Annotated[
    str | None, Field(max_length=5000), BeforeValidator(optional_text)
]


class ContributionDeclare(BaseModel):
    model_config = ConfigDict(extra="forbid")
    declaration_reference: OptionalReference = None
    declaration_note: OptionalNote = None


class ContributionReject(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: Annotated[
        str,
        Field(min_length=3, max_length=2000),
        BeforeValidator(
            lambda value: value.strip() if isinstance(value, str) else value
        ),
    ]


class ContributionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    cycle_id: UUID
    turn_id: UUID
    membership_id: UUID
    amount_due: Decimal
    status: ContributionStatus
    effective_status: EffectiveContributionStatus
    due_at: datetime
    declared_at: datetime | None
    declaration_reference: str | None
    declaration_note: str | None
    confirmed_at: datetime | None
    confirmed_by_user_id: UUID | None
    rejected_at: datetime | None
    rejected_by_user_id: UUID | None
    rejection_reason: str | None
    created_at: datetime
    updated_at: datetime


class ContributionList(BaseModel):
    items: list[ContributionRead]
    total: int
    limit: int
    offset: int


class ContributionSummary(BaseModel):
    cycle_id: UUID
    obligations_total: int
    expected_amount: Decimal
    declared_amount: Decimal
    confirmed_amount: Decimal
    late_amount: Decimal
    pending_count: int
    declared_count: int
    confirmed_count: int
    rejected_count: int
    late_count: int
    cancelled_count: int
