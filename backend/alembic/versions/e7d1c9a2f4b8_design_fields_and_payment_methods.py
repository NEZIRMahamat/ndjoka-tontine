"""Champs du parcours produit, contact utilisateur et moyens de paiement.

Revision ID: e7d1c9a2f4b8
Revises: c8f2a5d71e43
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "e7d1c9a2f4b8"
down_revision = "c8f2a5d71e43"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Tontines : thématique, objectif, ville, règles et ordre de passage.
    op.add_column(
        "tontines",
        sa.Column(
            "category",
            sa.String(20),
            server_default=sa.text("'other'"),
            nullable=False,
        ),
    )
    op.add_column("tontines", sa.Column("goal", sa.String(255), nullable=True))
    op.add_column("tontines", sa.Column("city", sa.String(120), nullable=True))
    op.add_column(
        "tontines",
        sa.Column(
            "order_mode",
            sa.String(20),
            server_default=sa.text("'registration'"),
            nullable=False,
        ),
    )
    op.add_column("tontines", sa.Column("rules", sa.Text(), nullable=True))
    op.add_column(
        "tontines",
        sa.Column(
            "late_penalty_enabled",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "tontines", sa.Column("cover_image_url", sa.String(2048), nullable=True)
    )
    op.create_check_constraint(
        op.f("ck_tontines_category"),
        "tontines",
        "category IN ('business', 'family', 'travel', 'solidarity', "
        "'housing', 'education', 'other')",
    )
    op.create_check_constraint(
        op.f("ck_tontines_order_mode"),
        "tontines",
        "order_mode IN ('lottery', 'registration', 'vote')",
    )

    # Utilisateurs : coordonnées de contact et préférences de notification.
    op.add_column("users", sa.Column("phone", sa.String(32), nullable=True))
    op.add_column("users", sa.Column("address", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("city", sa.String(120), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "notification_preferences",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )

    # Moyens de paiement déclarés (référence masquée uniquement).
    op.create_table(
        "payment_methods",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("label", sa.String(60), nullable=False),
        sa.Column("last4", sa.String(4), nullable=False),
        sa.Column(
            "is_default",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payment_methods")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name=op.f("fk_payment_methods_user_id_users"),
        ),
        sa.CheckConstraint(
            "type IN ('card', 'sepa', 'mobile_money')",
            name=op.f("ck_payment_methods_type"),
        ),
        sa.CheckConstraint(
            "char_length(btrim(label)) BETWEEN 2 AND 60",
            name=op.f("ck_payment_methods_label_length"),
        ),
        sa.CheckConstraint(
            "char_length(last4) = 4", name=op.f("ck_payment_methods_last4_length")
        ),
    )
    op.create_index(
        "ix_payment_methods_user_created",
        "payment_methods",
        ["user_id", "created_at", "id"],
    )
    op.create_index(
        "uq_payment_methods_one_default",
        "payment_methods",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("is_default"),
    )


def downgrade() -> None:
    op.drop_index("uq_payment_methods_one_default", table_name="payment_methods")
    op.drop_index("ix_payment_methods_user_created", table_name="payment_methods")
    op.drop_table("payment_methods")
    op.drop_column("users", "notification_preferences")
    op.drop_column("users", "city")
    op.drop_column("users", "address")
    op.drop_column("users", "phone")
    op.drop_constraint(op.f("ck_tontines_order_mode"), "tontines", type_="check")
    op.drop_constraint(op.f("ck_tontines_category"), "tontines", type_="check")
    for column in (
        "cover_image_url",
        "late_penalty_enabled",
        "rules",
        "order_mode",
        "city",
        "goal",
        "category",
    ):
        op.drop_column("tontines", column)
