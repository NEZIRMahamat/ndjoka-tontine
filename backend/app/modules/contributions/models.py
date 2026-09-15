from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.modules.contributions.enums import ContributionStatus

if TYPE_CHECKING:
    from app.modules.cycles.models import Cycle, CycleTurn
    from app.modules.memberships.models import Membership
    from app.modules.users.models import User


class Contribution(Base):
    __tablename__ = "contributions"
    __table_args__ = (
        CheckConstraint("amount_due > 0", name="amount_positive"),
        CheckConstraint(
            "status IN ('pending', 'declared', 'confirmed', 'rejected', 'cancelled')",
            name="status",
        ),
        CheckConstraint(
            "(status IN ('declared', 'confirmed')) = (declared_at IS NOT NULL)",
            name="declaration_consistency",
        ),
        CheckConstraint(
            "(status = 'confirmed') = (confirmed_at IS NOT NULL AND confirmed_by_user_id IS NOT NULL)",
            name="confirmation_consistency",
        ),
        CheckConstraint(
            "(status = 'rejected') = (rejected_at IS NOT NULL AND rejected_by_user_id IS NOT NULL AND rejection_reason IS NOT NULL)",
            name="rejection_consistency",
        ),
        Index(
            "uq_contributions_turn_membership", "turn_id", "membership_id", unique=True
        ),
        Index(
            "ix_contributions_cycle_status_due", "cycle_id", "status", "due_at", "id"
        ),
        Index("ix_contributions_membership_due", "membership_id", "due_at", "id"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    cycle_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("cycles.id", ondelete="CASCADE"), nullable=False
    )
    turn_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("cycle_turns.id", ondelete="CASCADE"), nullable=False
    )
    membership_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("memberships.id", ondelete="RESTRICT"), nullable=False
    )
    amount_due: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    status: Mapped[ContributionStatus] = mapped_column(
        Enum(
            ContributionStatus,
            native_enum=False,
            create_constraint=False,
            validate_strings=True,
            values_callable=lambda values: [value.value for value in values],
            length=20,
        ),
        nullable=False,
        server_default=text("'pending'"),
    )
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    declared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    declaration_reference: Mapped[str | None] = mapped_column(String(255))
    declaration_note: Mapped[str | None] = mapped_column(Text)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmed_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT")
    )
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT")
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    cycle: Mapped[Cycle] = relationship(foreign_keys=[cycle_id])
    turn: Mapped[CycleTurn] = relationship(foreign_keys=[turn_id])
    membership: Mapped[Membership] = relationship(foreign_keys=[membership_id])
    confirmed_by: Mapped[User | None] = relationship(
        foreign_keys=[confirmed_by_user_id]
    )
    rejected_by: Mapped[User | None] = relationship(foreign_keys=[rejected_by_user_id])
