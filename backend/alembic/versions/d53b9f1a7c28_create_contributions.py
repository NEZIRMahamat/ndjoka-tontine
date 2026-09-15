"""Create contributions for Sprint 5.

Revision ID: d53b9f1a7c28
Revises: c42a8e0f6b17
"""

import sqlalchemy as sa

from alembic import op

revision = "d53b9f1a7c28"
down_revision = "c42a8e0f6b17"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "contributions",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("cycle_id", sa.Uuid(), nullable=False),
        sa.Column("turn_id", sa.Uuid(), nullable=False),
        sa.Column("membership_id", sa.Uuid(), nullable=False),
        sa.Column("amount_due", sa.Numeric(18, 2), nullable=False),
        sa.Column(
            "status", sa.String(20), server_default=sa.text("'pending'"), nullable=False
        ),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("declared_at", sa.DateTime(timezone=True)),
        sa.Column("declaration_reference", sa.String(255)),
        sa.Column("declaration_note", sa.Text()),
        sa.Column("confirmed_at", sa.DateTime(timezone=True)),
        sa.Column("confirmed_by_user_id", sa.Uuid()),
        sa.Column("rejected_at", sa.DateTime(timezone=True)),
        sa.Column("rejected_by_user_id", sa.Uuid()),
        sa.Column("rejection_reason", sa.Text()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["cycle_id"],
            ["cycles.id"],
            ondelete="CASCADE",
            name=op.f("fk_contributions_cycle_id_cycles"),
        ),
        sa.ForeignKeyConstraint(
            ["turn_id"],
            ["cycle_turns.id"],
            ondelete="CASCADE",
            name=op.f("fk_contributions_turn_id_cycle_turns"),
        ),
        sa.ForeignKeyConstraint(
            ["membership_id"],
            ["memberships.id"],
            ondelete="RESTRICT",
            name=op.f("fk_contributions_membership_id_memberships"),
        ),
        sa.ForeignKeyConstraint(
            ["confirmed_by_user_id"],
            ["users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_contributions_confirmed_by_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["rejected_by_user_id"],
            ["users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_contributions_rejected_by_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_contributions")),
        sa.CheckConstraint(
            "amount_due > 0", name=op.f("ck_contributions_amount_positive")
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'declared', 'confirmed', 'rejected', 'cancelled')",
            name=op.f("ck_contributions_status"),
        ),
        sa.CheckConstraint(
            "(status IN ('declared', 'confirmed')) = (declared_at IS NOT NULL)",
            name=op.f("ck_contributions_declaration_consistency"),
        ),
        sa.CheckConstraint(
            "(status = 'confirmed') = (confirmed_at IS NOT NULL AND confirmed_by_user_id IS NOT NULL)",
            name=op.f("ck_contributions_confirmation_consistency"),
        ),
        sa.CheckConstraint(
            "(status = 'rejected') = (rejected_at IS NOT NULL AND rejected_by_user_id IS NOT NULL AND rejection_reason IS NOT NULL)",
            name=op.f("ck_contributions_rejection_consistency"),
        ),
    )
    op.create_index(
        "uq_contributions_turn_membership",
        "contributions",
        ["turn_id", "membership_id"],
        unique=True,
    )
    op.create_index(
        "ix_contributions_cycle_status_due",
        "contributions",
        ["cycle_id", "status", "due_at", "id"],
    )
    op.create_index(
        "ix_contributions_membership_due",
        "contributions",
        ["membership_id", "due_at", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_contributions_membership_due", table_name="contributions")
    op.drop_index("ix_contributions_cycle_status_due", table_name="contributions")
    op.drop_index("uq_contributions_turn_membership", table_name="contributions")
    op.drop_table("contributions")
