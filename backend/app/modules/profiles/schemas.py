from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.modules.profiles.enums import (
    ContributionRhythm,
    ExperienceLevel,
    GroupSizePreference,
    SavingsGoal,
    TurnPreference,
)

MonthlyCapacity = Annotated[Decimal, Field(gt=0, le=1_000_000, decimal_places=2)]
HorizonMonths = Annotated[int, Field(strict=True, ge=1, le=120)]


class SaverProfileInput(BaseModel):
    """Les sept variables déclaratives collectées à l'onboarding."""

    model_config = ConfigDict(extra="forbid")

    monthly_capacity: MonthlyCapacity
    preferred_rhythm: ContributionRhythm
    savings_goal: SavingsGoal
    horizon_months: HorizonMonths
    group_size_preference: GroupSizePreference
    experience_level: ExperienceLevel
    turn_preference: TurnPreference


class SaverProfileRead(SaverProfileInput):
    model_config = ConfigDict(from_attributes=True)

    created_at: datetime
    updated_at: datetime


class ReliabilityRead(BaseModel):
    """Score de fiabilité et indicateurs comportementaux le justifiant."""

    score: Decimal
    band: str
    is_provisional: bool
    contributions_total: int
    contributions_on_time: int
    contributions_late: int
    contributions_outstanding: int
    cycles_completed: int
    on_time_rate: Decimal | None
    explanation: str


class PublicProfileRead(BaseModel):
    """Profil consultable par les autres membres : aucune donnée de contact,
    bancaire ou financière individuelle, uniquement la réputation et
    l'ancienneté."""

    user_id: UUID
    display_name: str | None
    avatar_url: str | None
    city: str | None
    member_since: datetime
    reliability: ReliabilityRead
    active_tontines: int
    completed_cycles: int
    experience_level: ExperienceLevel | None
    shared_tontines: list[str]
