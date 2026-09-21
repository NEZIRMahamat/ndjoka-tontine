"""Create notifications, Outbox, email deliveries and Resend webhooks.

Revision ID: a91c4e7d2b60
Revises: f75db14c9a20
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "a91c4e7d2b60"
down_revision = "f75db14c9a20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("recipient_user_id", sa.Uuid(), nullable=False),
        sa.Column("tontine_id", sa.Uuid()),
        sa.Column("event_name", sa.String(100), nullable=False),
        sa.Column(
            "payload",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("action_path", sa.String(500)),
        sa.Column(
            "status", sa.String(10), server_default=sa.text("'unread'"), nullable=False
        ),
        sa.Column("deduplication_key", sa.String(255), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('unread','read')", name=op.f("ck_notifications_status")
        ),
        sa.CheckConstraint(
            "(status = 'read') = (read_at IS NOT NULL)",
            name=op.f("ck_notifications_read_consistency"),
        ),
        sa.ForeignKeyConstraint(
            ["recipient_user_id"],
            ["users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_notifications_recipient_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["tontine_id"],
            ["tontines.id"],
            ondelete="RESTRICT",
            name=op.f("fk_notifications_tontine_id_tontines"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notifications")),
    )
    op.create_index(
        "uq_notifications_deduplication_key",
        "notifications",
        ["deduplication_key"],
        unique=True,
    )
    op.create_index(
        "ix_notifications_recipient_created",
        "notifications",
        ["recipient_user_id", "created_at", "id"],
    )
    op.create_index(
        "ix_notifications_recipient_status",
        "notifications",
        ["recipient_user_id", "status", "created_at"],
    )

    op.create_table(
        "outbox_events",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("event_name", sa.String(100), nullable=False),
        sa.Column("aggregate_type", sa.String(50), nullable=False),
        sa.Column("aggregate_id", sa.Uuid(), nullable=False),
        sa.Column("tontine_id", sa.Uuid()),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("deduplication_key", sa.String(255), nullable=False),
        sa.Column(
            "status", sa.String(20), server_default=sa.text("'pending'"), nullable=False
        ),
        sa.Column(
            "attempt_count", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column(
            "next_attempt_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('pending','processing','processed','failed','dead')",
            name=op.f("ck_outbox_events_status"),
        ),
        sa.CheckConstraint(
            "attempt_count >= 0 AND attempt_count <= 3",
            name=op.f("ck_outbox_events_attempt_count"),
        ),
        sa.ForeignKeyConstraint(
            ["tontine_id"],
            ["tontines.id"],
            ondelete="RESTRICT",
            name=op.f("fk_outbox_events_tontine_id_tontines"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_outbox_events")),
    )
    op.create_index(
        "uq_outbox_events_deduplication_key",
        "outbox_events",
        ["deduplication_key"],
        unique=True,
    )
    op.create_index(
        "ix_outbox_events_due",
        "outbox_events",
        ["status", "next_attempt_at", "created_at", "id"],
    )
    op.create_index(
        "ix_outbox_events_aggregate",
        "outbox_events",
        ["aggregate_type", "aggregate_id"],
    )

    op.create_table(
        "email_deliveries",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("notification_id", sa.Uuid()),
        sa.Column("resend_email_id", sa.String(255)),
        sa.Column("idempotency_key", sa.String(255), nullable=False),
        sa.Column(
            "status", sa.String(20), server_default=sa.text("'pending'"), nullable=False
        ),
        sa.Column(
            "attempt_count", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column(
            "next_attempt_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("last_error_code", sa.String(100)),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
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
        sa.CheckConstraint(
            "status IN ('pending','accepted','delivered','bounced','complained','failed','dead')",
            name=op.f("ck_email_deliveries_status"),
        ),
        sa.CheckConstraint(
            "attempt_count >= 0 AND attempt_count <= 3",
            name=op.f("ck_email_deliveries_attempt_count"),
        ),
        sa.ForeignKeyConstraint(
            ["notification_id"],
            ["notifications.id"],
            ondelete="CASCADE",
            name=op.f("fk_email_deliveries_notification_id_notifications"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_email_deliveries")),
    )
    op.create_index(
        "uq_email_deliveries_idempotency_key",
        "email_deliveries",
        ["idempotency_key"],
        unique=True,
    )
    op.create_index(
        "uq_email_deliveries_resend_email_id",
        "email_deliveries",
        ["resend_email_id"],
        unique=True,
        postgresql_where=sa.text("resend_email_id IS NOT NULL"),
    )
    op.create_index(
        "ix_email_deliveries_due",
        "email_deliveries",
        ["status", "next_attempt_at", "created_at"],
    )

    op.create_table(
        "resend_webhook_events",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("svix_id", sa.String(255), nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("resend_email_id", sa.String(255)),
        sa.Column("provider_occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "processed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_resend_webhook_events")),
    )
    op.create_index(
        "uq_resend_webhook_events_svix_id",
        "resend_webhook_events",
        ["svix_id"],
        unique=True,
    )
    op.create_index(
        "ix_resend_webhook_events_email",
        "resend_webhook_events",
        ["resend_email_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_table("resend_webhook_events")
    op.drop_table("email_deliveries")
    op.drop_table("outbox_events")
    op.drop_table("notifications")
