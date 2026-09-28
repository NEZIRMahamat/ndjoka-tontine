from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.modules.cycles.enums import CycleFrequency, CycleStatus
from app.modules.tontines.enums import TontineCategory, TontineStatus, TurnOrderMode


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
    status: TontineStatus
    category: TontineCategory
    goal: str | None
    city: str | None
    order_mode: TurnOrderMode
    rules: str | None
    late_penalty_enabled: bool
    cover_image_url: str | None
    cycle_status: CycleStatus | None
    start_date: date | None
    organizer_name: str | None
    organizer_since: datetime | None
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
