"""Create audited manual payouts (Sprint 6).

Revision ID: e64ca02b8d39
Revises: d53b9f1a7c28
"""

import sqlalchemy as sa

from alembic import op

revision = "e64ca02b8d39"
down_revision = "d53b9f1a7c28"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_turns_id_cycle_beneficiary",
        "cycle_turns",
        ["id", "cycle_id", "beneficiary_membership_id"],
    )
    op.create_unique_constraint("uq_cycles_id_tontine", "cycles", ["id", "tontine_id"])
    op.create_table(
        "payouts",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("tontine_id", sa.Uuid(), nullable=False),
        sa.Column("cycle_id", sa.Uuid(), nullable=False),
        sa.Column("turn_id", sa.Uuid(), nullable=False),
        sa.Column("beneficiary_membership_id", sa.Uuid(), nullable=False),
        sa.Column("expected_amount", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column(
            "available_amount",
            sa.Numeric(precision=18, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("approved_amount", sa.Numeric(precision=18, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "ready",
                "approved",
                "declared_paid",
                "received",
                "disputed",
                "cancelled",
                name="payoutstatus",
                native_enum=False,
                length=20,
            ),
            server_default=sa.text("'pending'"),
            nullable=False,
        ),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("declared_paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("declared_paid_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("external_reference", sa.String(length=255), nullable=True),
        sa.Column("payment_note", sa.Text(), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("disputed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dispute_reason", sa.Text(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancellation_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(resolved_at IS NULL AND resolved_by_user_id IS NULL AND resolution_note IS NULL) OR (resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL AND resolution_note IS NOT NULL AND disputed_at IS NOT NULL AND status = 'received')",
            name=op.f("ck_payouts_resolution_trace"),
        ),
        sa.CheckConstraint(
            "(status = 'cancelled') = (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)",
            name=op.f("ck_payouts_cancellation"),
        ),
        sa.CheckConstraint(
            "(status = 'received') = (received_at IS NOT NULL)",
            name=op.f("ck_payouts_receipt"),
        ),
        sa.CheckConstraint(
            "(status IN ('declared_paid','received','disputed')) = (declared_paid_at IS NOT NULL)",
            name=op.f("ck_payouts_payment_required"),
        ),
        sa.CheckConstraint(
            "status != 'disputed' OR disputed_at IS NOT NULL",
            name=op.f("ck_payouts_dispute_required"),
        ),
        sa.CheckConstraint(
            "status IN ('pending','ready','approved','declared_paid','received','disputed','cancelled')",
            name=op.f("ck_payouts_status"),
        ),
        sa.CheckConstraint(
            "status NOT IN ('approved','declared_paid','received','disputed') OR approved_at IS NOT NULL",
            name=op.f("ck_payouts_approval_required"),
        ),
        sa.CheckConstraint(
            "(approved_at IS NULL AND approved_by_user_id IS NULL AND approved_amount IS NULL) OR (approved_at IS NOT NULL AND approved_by_user_id IS NOT NULL AND approved_amount IS NOT NULL)",
            name=op.f("ck_payouts_approval_trace"),
        ),
        sa.CheckConstraint(
            "(declared_paid_at IS NULL) = (declared_paid_by_user_id IS NULL)",
            name=op.f("ck_payouts_payment_trace"),
        ),
        sa.CheckConstraint(
            "(disputed_at IS NULL) = (dispute_reason IS NULL)",
            name=op.f("ck_payouts_dispute_trace"),
        ),
        sa.CheckConstraint(
            "approved_amount IS NULL OR (approved_amount > 0 AND approved_amount = expected_amount AND approved_amount <= available_amount)",
            name=op.f("ck_payouts_approved_amount"),
        ),
        sa.CheckConstraint(
            "char_length(currency) = 3", name=op.f("ck_payouts_currency")
        ),
        sa.CheckConstraint(
            "expected_amount >= 0 AND available_amount >= 0 AND available_amount <= expected_amount",
            name=op.f("ck_payouts_amounts"),
        ),
        sa.ForeignKeyConstraint(
            ["approved_by_user_id"],
            ["users.id"],
            name=op.f("fk_payouts_approved_by_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["cycle_id", "tontine_id"],
            ["cycles.id", "cycles.tontine_id"],
            name="fk_payouts_cycle_tontine",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["declared_paid_by_user_id"],
            ["users.id"],
            name=op.f("fk_payouts_declared_paid_by_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["resolved_by_user_id"],
            ["users.id"],
            name=op.f("fk_payouts_resolved_by_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["turn_id", "cycle_id", "beneficiary_membership_id"],
            [
                "cycle_turns.id",
                "cycle_turns.cycle_id",
                "cycle_turns.beneficiary_membership_id",
            ],
            name="fk_payouts_turn_beneficiary",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payouts")),
    )
    op.create_index(
        "ix_payouts_beneficiary_scheduled",
        "payouts",
        ["beneficiary_membership_id", "scheduled_for", "id"],
        unique=False,
    )
    op.create_index(
        "ix_payouts_cycle_status_scheduled",
        "payouts",
        ["cycle_id", "status", "scheduled_for", "id"],
        unique=False,
    )
    op.create_index("uq_payouts_turn", "payouts", ["turn_id"], unique=True)


def downgrade() -> None:
    # Development rollback only: removes payout history, never run on production.
    op.drop_table("payouts")
    op.drop_constraint("uq_turns_id_cycle_beneficiary", "cycle_turns", type_="unique")
    op.drop_constraint("uq_cycles_id_tontine", "cycles", type_="unique")
