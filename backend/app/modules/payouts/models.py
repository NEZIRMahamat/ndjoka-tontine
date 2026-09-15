from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Numeric,
    String,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.modules.payouts.enums import PayoutStatus


class Payout(Base):
    __tablename__ = "payouts"
    __table_args__ = (
        ForeignKeyConstraint(
            ["cycle_id", "tontine_id"],
            ["cycles.id", "cycles.tontine_id"],
            name="fk_payouts_cycle_tontine",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["turn_id", "cycle_id", "beneficiary_membership_id"],
            [
                "cycle_turns.id",
                "cycle_turns.cycle_id",
                "cycle_turns.beneficiary_membership_id",
            ],
            name="fk_payouts_turn_beneficiary",
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "expected_amount >= 0 AND available_amount >= 0 AND available_amount <= expected_amount",
            name="amounts",
        ),
        CheckConstraint(
            "approved_amount IS NULL OR (approved_amount > 0 AND approved_amount = expected_amount AND approved_amount <= available_amount)",
            name="approved_amount",
        ),
        CheckConstraint(
            "status IN ('pending','ready','approved','declared_paid','received','disputed','cancelled')",
            name="status",
        ),
        CheckConstraint(
            "(approved_at IS NULL AND approved_by_user_id IS NULL AND approved_amount IS NULL) OR (approved_at IS NOT NULL AND approved_by_user_id IS NOT NULL AND approved_amount IS NOT NULL)",
            name="approval_trace",
        ),
        CheckConstraint(
            "status NOT IN ('approved','declared_paid','received','disputed') OR approved_at IS NOT NULL",
            name="approval_required",
        ),
        CheckConstraint(
            "(declared_paid_at IS NULL) = (declared_paid_by_user_id IS NULL)",
            name="payment_trace",
        ),
        CheckConstraint(
            "(status IN ('declared_paid','received','disputed')) = (declared_paid_at IS NOT NULL)",
            name="payment_required",
        ),
        CheckConstraint(
            "(status = 'received') = (received_at IS NOT NULL)", name="receipt"
        ),
        CheckConstraint(
            "(disputed_at IS NULL) = (dispute_reason IS NULL)", name="dispute_trace"
        ),
        CheckConstraint(
            "status != 'disputed' OR disputed_at IS NOT NULL", name="dispute_required"
        ),
        CheckConstraint(
            "(resolved_at IS NULL AND resolved_by_user_id IS NULL AND resolution_note IS NULL) OR (resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL AND resolution_note IS NOT NULL AND disputed_at IS NOT NULL AND status = 'received')",
            name="resolution_trace",
        ),
        CheckConstraint(
            "(status = 'cancelled') = (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)",
            name="cancellation",
        ),
        CheckConstraint("char_length(currency) = 3", name="currency"),
        Index("uq_payouts_turn", "turn_id", unique=True),
        Index(
            "ix_payouts_cycle_status_scheduled",
            "cycle_id",
            "status",
            "scheduled_for",
            "id",
        ),
        Index(
            "ix_payouts_beneficiary_scheduled",
            "beneficiary_membership_id",
            "scheduled_for",
            "id",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    tontine_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    cycle_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    turn_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    beneficiary_membership_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    expected_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    available_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, server_default=text("0")
    )
    approved_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[PayoutStatus] = mapped_column(
        Enum(
            PayoutStatus,
            native_enum=False,
            create_constraint=False,
            validate_strings=True,
            values_callable=lambda values: [value.value for value in values],
            length=20,
        ),
        nullable=False,
        server_default=text("'pending'"),
    )
    scheduled_for: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT")
    )
    declared_paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    declared_paid_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT")
    )
    external_reference: Mapped[str | None] = mapped_column(String(255))
    payment_note: Mapped[str | None] = mapped_column(Text)
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    disputed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dispute_reason: Mapped[str | None] = mapped_column(Text)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT")
    )
    resolution_note: Mapped[str | None] = mapped_column(Text)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
