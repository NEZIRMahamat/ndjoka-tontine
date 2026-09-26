from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.modules.profiles.enums import (
    ContributionRhythm,
    ExperienceLevel,
    GroupSizePreference,
    SavingsGoal,
    TurnPreference,
)


def _enum_column(enum_type: type, length: int) -> Enum:
    return Enum(
        enum_type,
        native_enum=False,
        create_constraint=False,
        validate_strings=True,
        values_callable=lambda values: [value.value for value in values],
        length=length,
    )


class SaverProfile(Base):
    """Profil d'épargnant : les sept variables déclaratives du matching.

    La collecte est volontairement limitée à ces sept variables, toutes
    directement exploitées par le moteur d'affinité (minimisation RGPD).
    """

    __tablename__ = "saver_profiles"
    __table_args__ = (
        CheckConstraint("monthly_capacity > 0", name="monthly_capacity_positive"),
        CheckConstraint(
            "horizon_months BETWEEN 1 AND 120", name="horizon_months_range"
        ),
        CheckConstraint(
            "savings_goal IN ('project', 'emergency', 'housing', 'education', "
            "'business')",
            name="savings_goal",
        ),
        CheckConstraint(
            "preferred_rhythm IN ('weekly', 'monthly')", name="preferred_rhythm"
        ),
        CheckConstraint(
            "group_size_preference IN ('small', 'medium', 'large')",
            name="group_size_preference",
        ),
        CheckConstraint(
            "experience_level IN ('beginner', 'intermediate', 'experienced')",
            name="experience_level",
        ),
        CheckConstraint(
            "turn_preference IN ('early', 'flexible', 'late')", name="turn_preference"
        ),
    )

    user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    monthly_capacity: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    preferred_rhythm: Mapped[ContributionRhythm] = mapped_column(
        _enum_column(ContributionRhythm, 20), nullable=False
    )
    savings_goal: Mapped[SavingsGoal] = mapped_column(
        _enum_column(SavingsGoal, 20), nullable=False
    )
    horizon_months: Mapped[int] = mapped_column(Integer, nullable=False)
    group_size_preference: Mapped[GroupSizePreference] = mapped_column(
        _enum_column(GroupSizePreference, 20), nullable=False
    )
    experience_level: Mapped[ExperienceLevel] = mapped_column(
        _enum_column(ExperienceLevel, 20), nullable=False
    )
    turn_preference: Mapped[TurnPreference] = mapped_column(
        _enum_column(TurnPreference, 20), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
