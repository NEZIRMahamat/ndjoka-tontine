"""Create memberships and invitations for Sprint 3.

Revision ID: b81e6c3d4f20
Revises: 7c2a91e4b630
"""

import sqlalchemy as sa

from alembic import op

revision = "b81e6c3d4f20"
down_revision = "7c2a91e4b630"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "memberships",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("tontine_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column(
            "status", sa.String(20), server_default=sa.text("'active'"), nullable=False
        ),
        sa.Column(
            "joined_at",
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
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_memberships")),
        sa.ForeignKeyConstraint(
            ["tontine_id"],
            ["tontines.id"],
            ondelete="CASCADE",
            name=op.f("fk_memberships_tontine_id_tontines"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_memberships_user_id_users"),
        ),
        sa.CheckConstraint(
            "role IN ('owner', 'manager', 'treasurer', 'member')",
            name=op.f("ck_memberships_role"),
        ),
        sa.CheckConstraint(
            "status IN ('active', 'left', 'removed')",
            name=op.f("ck_memberships_status"),
        ),
        sa.CheckConstraint(
            "(status = 'active' AND ended_at IS NULL) OR "
            "(status IN ('left', 'removed') AND ended_at IS NOT NULL)",
            name=op.f("ck_memberships_end_consistency"),
        ),
    )
    op.create_index(
        "uq_memberships_tontine_user",
        "memberships",
        ["tontine_id", "user_id"],
        unique=True,
    )
    op.create_index(
        "uq_memberships_one_active_owner",
        "memberships",
        ["tontine_id"],
        unique=True,
        postgresql_where=sa.text("role = 'owner' AND status = 'active'"),
    )
    op.create_index(
        "ix_memberships_user_status_tontine",
        "memberships",
        ["user_id", "status", "tontine_id"],
    )
    op.create_index(
        "ix_memberships_tontine_status_joined",
        "memberships",
        ["tontine_id", "status", "joined_at", "id"],
    )
    op.execute(
        """
        INSERT INTO memberships (tontine_id, user_id, role, status)
        SELECT id, created_by_user_id, 'owner', 'active'
        FROM tontines
        """
    )

    op.create_table(
        "invitations",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("tontine_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column(
            "status", sa.String(20), server_default=sa.text("'pending'"), nullable=False
        ),
        sa.Column("invited_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("accepted_by_user_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invitations")),
        sa.ForeignKeyConstraint(
            ["tontine_id"],
            ["tontines.id"],
            ondelete="CASCADE",
            name=op.f("fk_invitations_tontine_id_tontines"),
        ),
        sa.ForeignKeyConstraint(
            ["invited_by_user_id"],
            ["users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_invitations_invited_by_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["accepted_by_user_id"],
            ["users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_invitations_accepted_by_user_id_users"),
        ),
        sa.CheckConstraint(
            "role IN ('manager', 'treasurer', 'member')",
            name=op.f("ck_invitations_role"),
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'expired', 'revoked')",
            name=op.f("ck_invitations_status"),
        ),
        sa.CheckConstraint(
            "email = lower(btrim(email))", name=op.f("ck_invitations_email_normalized")
        ),
        sa.CheckConstraint(
            "char_length(token_hash) = 64",
            name=op.f("ck_invitations_token_hash_length"),
        ),
        sa.CheckConstraint(
            "expires_at > created_at", name=op.f("ck_invitations_expiry_after_creation")
        ),
        sa.CheckConstraint(
            "(status = 'accepted') = (accepted_at IS NOT NULL AND accepted_by_user_id IS NOT NULL)",
            name=op.f("ck_invitations_acceptance_consistency"),
        ),
        sa.CheckConstraint(
            "(status = 'revoked') = (revoked_at IS NOT NULL)",
            name=op.f("ck_invitations_revocation_consistency"),
        ),
    )
    op.create_index(
        "uq_invitations_token_hash", "invitations", ["token_hash"], unique=True
    )
    op.create_index(
        "uq_invitations_pending_email",
        "invitations",
        ["tontine_id", "email"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_index(
        "ix_invitations_tontine_created",
        "invitations",
        ["tontine_id", "created_at", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_invitations_tontine_created", table_name="invitations")
    op.drop_index("uq_invitations_pending_email", table_name="invitations")
    op.drop_index("uq_invitations_token_hash", table_name="invitations")
    op.drop_table("invitations")
    op.drop_index("ix_memberships_tontine_status_joined", table_name="memberships")
    op.drop_index("ix_memberships_user_status_tontine", table_name="memberships")
    op.drop_index("uq_memberships_one_active_owner", table_name="memberships")
    op.drop_index("uq_memberships_tontine_user", table_name="memberships")
    op.drop_table("memberships")
