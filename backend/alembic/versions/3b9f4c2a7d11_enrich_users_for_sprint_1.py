"""enrich users for sprint 1

Revision ID: 3b9f4c2a7d11
Revises: d94b607046b8
Create Date: 2026-08-31 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3b9f4c2a7d11"
down_revision: str | Sequence[str] | None = "d94b607046b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Enrichit les utilisateurs et migre les anciens statuts."""
    op.add_column("users", sa.Column("display_name", sa.String(120), nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.String(2048), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "locale",
            sa.String(35),
            server_default=sa.text("'fr'"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "timezone",
            sa.String(64),
            server_default=sa.text("'Europe/Paris'"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "global_role",
            sa.String(30),
            server_default=sa.text("'user'"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.drop_constraint(op.f("ck_users_status"), "users", type_="check")
    op.execute(
        sa.text("UPDATE users SET status = 'suspended' WHERE status = 'pending'")
    )
    op.execute(
        sa.text(
            "UPDATE users "
            "SET status = 'deactivated', "
            "deactivated_at = COALESCE(updated_at, created_at, now()) "
            "WHERE status = 'closed'"
        )
    )

    op.create_check_constraint(
        op.f("ck_users_status"),
        "users",
        "status IN ('active', 'suspended', 'deactivated')",
    )
    op.create_check_constraint(
        op.f("ck_users_global_role"),
        "users",
        "global_role IN ('user', 'support', 'platform_admin')",
    )
    op.create_check_constraint(
        op.f("ck_users_deactivated_at_required"),
        "users",
        "status != 'deactivated' OR deactivated_at IS NOT NULL",
    )


def downgrade() -> None:
    """Restaure le modèle minimal du Sprint 0."""
    op.drop_constraint(
        op.f("ck_users_deactivated_at_required"),
        "users",
        type_="check",
    )
    op.drop_constraint(op.f("ck_users_global_role"), "users", type_="check")
    op.drop_constraint(op.f("ck_users_status"), "users", type_="check")

    op.execute(
        sa.text("UPDATE users SET status = 'closed' WHERE status = 'deactivated'")
    )

    op.create_check_constraint(
        op.f("ck_users_status"),
        "users",
        "status IN ('pending', 'active', 'suspended', 'closed')",
    )

    op.drop_column("users", "deactivated_at")
    op.drop_column("users", "global_role")
    op.drop_column("users", "timezone")
    op.drop_column("users", "locale")
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "display_name")
