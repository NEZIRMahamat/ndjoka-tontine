from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.modules.cycles.enums import CycleFrequency


class AffinityReason(BaseModel):
    """Justification lisible d'un critère de correspondance."""

    criterion: str
    label: str
    matched: bool


class DiscoveredTontine(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    currency: str
    max_members: int | None
    member_count: int
    seats_left: int | None
    contribution_amount: Decimal | None
    frequency: CycleFrequency | None
    monthly_equivalent: Decimal | None
    min_reliability_score: Decimal | None
    created_at: datetime
    affinity_score: Decimal
    is_eligible: bool
    ineligibility_reason: str | None
    reasons: list[AffinityReason]


class DiscoveryList(BaseModel):
    items: list[DiscoveredTontine]
    total: int
    limit: int
    offset: int
    has_profile: bool
    reliability_score: Decimal
