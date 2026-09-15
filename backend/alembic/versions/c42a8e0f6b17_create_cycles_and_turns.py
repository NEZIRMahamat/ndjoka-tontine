"""Create cycles and turns for Sprint 4.

Revision ID: c42a8e0f6b17
Revises: b81e6c3d4f20
"""

import sqlalchemy as sa

from alembic import op

revision = "c42a8e0f6b17"
down_revision = "b81e6c3d4f20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cycles",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("tontine_id", sa.Uuid(), nullable=False),
        sa.Column("sequence_number", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("contribution_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("frequency", sa.String(20), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column(
            "timezone",
            sa.String(64),
            server_default=sa.text("'Europe/Paris'"),
            nullable=False,
        ),
        sa.Column(
            "beneficiary_contributes",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "status", sa.String(20), server_default=sa.text("'draft'"), nullable=False
        ),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("activated_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)),
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
            ["tontine_id"],
            ["tontines.id"],
            ondelete="CASCADE",
            name=op.f("fk_cycles_tontine_id_tontines"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_cycles_created_by_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cycles")),
        sa.CheckConstraint(
            "sequence_number >= 1", name=op.f("ck_cycles_sequence_positive")
        ),
        sa.CheckConstraint(
            "char_length(btrim(name)) BETWEEN 3 AND 120",
            name=op.f("ck_cycles_name_length"),
        ),
        sa.CheckConstraint(
            "contribution_amount > 0", name=op.f("ck_cycles_amount_positive")
        ),
        sa.CheckConstraint(
            "frequency IN ('weekly', 'monthly')", name=op.f("ck_cycles_frequency")
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'scheduled', 'active', 'completed', 'cancelled')",
            name=op.f("ck_cycles_status"),
        ),
        sa.CheckConstraint(
            "(status = 'active') = (activated_at IS NOT NULL AND completed_at IS NULL AND cancelled_at IS NULL)",
            name=op.f("ck_cycles_active_consistency"),
        ),
        sa.CheckConstraint(
            "(status = 'completed') = (completed_at IS NOT NULL)",
            name=op.f("ck_cycles_completed_consistency"),
        ),
        sa.CheckConstraint(
            "(status = 'cancelled') = (cancelled_at IS NOT NULL)",
            name=op.f("ck_cycles_cancelled_consistency"),
        ),
    )
    op.create_index(
        "uq_cycles_tontine_sequence",
        "cycles",
        ["tontine_id", "sequence_number"],
        unique=True,
    )
    op.create_index(
        "uq_cycles_one_active_per_tontine",
        "cycles",
        ["tontine_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )
    op.create_index(
        "ix_cycles_tontine_created", "cycles", ["tontine_id", "created_at", "id"]
    )
    op.create_table(
        "cycle_turns",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("cycle_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("beneficiary_membership_id", sa.Uuid(), nullable=False),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=False),
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
            name=op.f("fk_cycle_turns_cycle_id_cycles"),
        ),
        sa.ForeignKeyConstraint(
            ["beneficiary_membership_id"],
            ["memberships.id"],
            ondelete="RESTRICT",
            name=op.f("fk_cycle_turns_beneficiary_membership_id_memberships"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cycle_turns")),
        sa.CheckConstraint(
            "position >= 1", name=op.f("ck_cycle_turns_position_positive")
        ),
    )
    op.create_index(
        "uq_cycle_turns_cycle_position",
        "cycle_turns",
        ["cycle_id", "position"],
        unique=True,
    )
    op.create_index(
        "uq_cycle_turns_cycle_beneficiary",
        "cycle_turns",
        ["cycle_id", "beneficiary_membership_id"],
        unique=True,
    )
    op.create_index(
        "ix_cycle_turns_cycle_scheduled",
        "cycle_turns",
        ["cycle_id", "scheduled_for", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_cycle_turns_cycle_scheduled", table_name="cycle_turns")
    op.drop_index("uq_cycle_turns_cycle_beneficiary", table_name="cycle_turns")
    op.drop_index("uq_cycle_turns_cycle_position", table_name="cycle_turns")
    op.drop_table("cycle_turns")
    op.drop_index("ix_cycles_tontine_created", table_name="cycles")
    op.drop_index("uq_cycles_one_active_per_tontine", table_name="cycles")
    op.drop_index("uq_cycles_tontine_sequence", table_name="cycles")
    op.drop_table("cycles")
