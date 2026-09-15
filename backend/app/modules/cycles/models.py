from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.modules.cycles.enums import CycleFrequency, CycleStatus

if TYPE_CHECKING:
    from app.modules.memberships.models import Membership
    from app.modules.tontines.models import Tontine
    from app.modules.users.models import User


def enum_type(enum: type, length: int) -> Enum:
    return Enum(
        enum,
        native_enum=False,
        create_constraint=False,
        validate_strings=True,
        values_callable=lambda values: [value.value for value in values],
        length=length,
    )


class Cycle(Base):
    __tablename__ = "cycles"
    __table_args__ = (
        UniqueConstraint("id", "tontine_id", name="uq_cycles_id_tontine"),
        CheckConstraint("sequence_number >= 1", name="sequence_positive"),
        CheckConstraint(
            "char_length(btrim(name)) BETWEEN 3 AND 120", name="name_length"
        ),
        CheckConstraint("contribution_amount > 0", name="amount_positive"),
        CheckConstraint("frequency IN ('weekly', 'monthly')", name="frequency"),
        CheckConstraint(
            "status IN ('draft', 'scheduled', 'active', 'completed', 'cancelled')",
            name="status",
        ),
        CheckConstraint(
            "(status = 'active') = (activated_at IS NOT NULL AND completed_at IS NULL AND cancelled_at IS NULL)",
            name="active_consistency",
        ),
        CheckConstraint(
            "(status = 'completed') = (completed_at IS NOT NULL)",
            name="completed_consistency",
        ),
        CheckConstraint(
            "(status = 'cancelled') = (cancelled_at IS NOT NULL)",
            name="cancelled_consistency",
        ),
        Index(
            "uq_cycles_tontine_sequence", "tontine_id", "sequence_number", unique=True
        ),
        Index(
            "uq_cycles_one_active_per_tontine",
            "tontine_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        Index("ix_cycles_tontine_created", "tontine_id", "created_at", "id"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    tontine_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("tontines.id", ondelete="CASCADE"), nullable=False
    )
    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    contribution_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    frequency: Mapped[CycleFrequency] = mapped_column(
        enum_type(CycleFrequency, 20), nullable=False
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, server_default=text("'Europe/Paris'")
    )
    beneficiary_contributes: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    status: Mapped[CycleStatus] = mapped_column(
        enum_type(CycleStatus, 20), nullable=False, server_default=text("'draft'")
    )
    created_by_user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    tontine: Mapped[Tontine] = relationship(foreign_keys=[tontine_id])
    created_by: Mapped[User] = relationship(foreign_keys=[created_by_user_id])
    turns: Mapped[list[CycleTurn]] = relationship(
        back_populates="cycle",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="CycleTurn.position",
    )


class CycleTurn(Base):
    __tablename__ = "cycle_turns"
    __table_args__ = (
        UniqueConstraint(
            "id",
            "cycle_id",
            "beneficiary_membership_id",
            name="uq_turns_id_cycle_beneficiary",
        ),
        CheckConstraint("position >= 1", name="position_positive"),
        Index("uq_cycle_turns_cycle_position", "cycle_id", "position", unique=True),
        Index(
            "uq_cycle_turns_cycle_beneficiary",
            "cycle_id",
            "beneficiary_membership_id",
            unique=True,
        ),
        Index("ix_cycle_turns_cycle_scheduled", "cycle_id", "scheduled_for", "id"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    cycle_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("cycles.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    beneficiary_membership_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("memberships.id", ondelete="RESTRICT"), nullable=False
    )
    scheduled_for: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
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
    cycle: Mapped[Cycle] = relationship(back_populates="turns")
    beneficiary_membership: Mapped[Membership] = relationship(
        foreign_keys=[beneficiary_membership_id]
    )
