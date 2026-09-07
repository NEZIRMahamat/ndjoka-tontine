"""Create tontines for Sprint 2.

Revision ID: 7c2a91e4b630
Revises: 3b9f4c2a7d11
"""

import sqlalchemy as sa

from alembic import op

revision = "7c2a91e4b630"
down_revision = "3b9f4c2a7d11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tontines",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "currency", sa.String(3), server_default=sa.text("'EUR'"), nullable=False
        ),
        sa.Column("max_members", sa.Integer(), nullable=True),
        sa.Column(
            "status", sa.String(20), server_default=sa.text("'draft'"), nullable=False
        ),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
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
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tontines")),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_tontines_created_by_user_id_users"),
        ),
        sa.CheckConstraint(
            "char_length(btrim(name)) BETWEEN 3 AND 120",
            name=op.f("ck_tontines_name_length"),
        ),
        sa.CheckConstraint(
            "currency ~ '^[A-Z]{3}$'", name=op.f("ck_tontines_currency_format")
        ),
        sa.CheckConstraint(
            "max_members IS NULL OR max_members >= 2",
            name=op.f("ck_tontines_max_members"),
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'active', 'archived')", name=op.f("ck_tontines_status")
        ),
        sa.CheckConstraint(
            "(status = 'archived') = (archived_at IS NOT NULL)",
            name=op.f("ck_tontines_archive_consistency"),
        ),
    )
    op.create_index(
        "ix_tontines_creator_created_id",
        "tontines",
        ["created_by_user_id", "created_at", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_tontines_creator_created_id", table_name="tontines")
    op.drop_table("tontines")
