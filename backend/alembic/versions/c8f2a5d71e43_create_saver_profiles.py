"""Create saver profiles and tontine discovery settings.

Revision ID: c8f2a5d71e43
Revises: a91c4e7d2b60
"""

import sqlalchemy as sa

from alembic import op

revision = "c8f2a5d71e43"
down_revision = "a91c4e7d2b60"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "saver_profiles",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("monthly_capacity", sa.Numeric(18, 2), nullable=False),
        sa.Column("preferred_rhythm", sa.String(20), nullable=False),
        sa.Column("savings_goal", sa.String(20), nullable=False),
        sa.Column("horizon_months", sa.Integer(), nullable=False),
        sa.Column("group_size_preference", sa.String(20), nullable=False),
        sa.Column("experience_level", sa.String(20), nullable=False),
        sa.Column("turn_preference", sa.String(20), nullable=False),
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
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_saver_profiles")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name=op.f("fk_saver_profiles_user_id_users"),
        ),
        sa.CheckConstraint(
            "monthly_capacity > 0",
            name=op.f("ck_saver_profiles_monthly_capacity_positive"),
        ),
        sa.CheckConstraint(
            "horizon_months BETWEEN 1 AND 120",
            name=op.f("ck_saver_profiles_horizon_months_range"),
        ),
        sa.CheckConstraint(
            "savings_goal IN ('project', 'emergency', 'housing', 'education', "
            "'business')",
            name=op.f("ck_saver_profiles_savings_goal"),
        ),
        sa.CheckConstraint(
            "preferred_rhythm IN ('weekly', 'monthly')",
            name=op.f("ck_saver_profiles_preferred_rhythm"),
        ),
        sa.CheckConstraint(
            "group_size_preference IN ('small', 'medium', 'large')",
            name=op.f("ck_saver_profiles_group_size_preference"),
        ),
        sa.CheckConstraint(
            "experience_level IN ('beginner', 'intermediate', 'experienced')",
            name=op.f("ck_saver_profiles_experience_level"),
        ),
        sa.CheckConstraint(
            "turn_preference IN ('early', 'flexible', 'late')",
            name=op.f("ck_saver_profiles_turn_preference"),
        ),
    )

    # Les tontines existantes ont été créées sur invitation : elles restent
    # privées tant que leur propriétaire ne les ouvre pas explicitement.
    op.add_column(
        "tontines",
        sa.Column(
            "is_discoverable",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "tontines",
        sa.Column("min_reliability_score", sa.Numeric(4, 3), nullable=True),
    )
    op.create_check_constraint(
        op.f("ck_tontines_min_reliability_range"),
        "tontines",
        "min_reliability_score IS NULL "
        "OR (min_reliability_score >= 0 AND min_reliability_score <= 1)",
    )
    op.create_index(
        "ix_tontines_discoverable",
        "tontines",
        ["status", "created_at", "id"],
        postgresql_where=sa.text("is_discoverable"),
    )


def downgrade() -> None:
    op.drop_index("ix_tontines_discoverable", table_name="tontines")
    op.drop_constraint(
        op.f("ck_tontines_min_reliability_range"), "tontines", type_="check"
    )
    op.drop_column("tontines", "min_reliability_score")
    op.drop_column("tontines", "is_discoverable")
    op.drop_table("saver_profiles")
