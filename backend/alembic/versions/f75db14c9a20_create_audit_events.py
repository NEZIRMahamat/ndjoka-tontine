"""Create immutable business audit events (Sprint 7).

Revision ID: f75db14c9a20
Revises: e64ca02b8d39
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "f75db14c9a20"
down_revision = "e64ca02b8d39"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_events",
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("event_name", sa.String(100), nullable=False),
        sa.Column(
            "schema_version", sa.Integer(), server_default=sa.text("1"), nullable=False
        ),
        sa.Column("actor_type", sa.String(10), nullable=False),
        sa.Column("actor_user_id", sa.Uuid()),
        sa.Column("subject_user_id", sa.Uuid()),
        sa.Column("tontine_id", sa.Uuid()),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", sa.Uuid(), nullable=False),
        sa.Column(
            "changes",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "context",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text('\'{"source":"api"}\'::jsonb'),
            nullable=False,
        ),
        sa.Column("request_id", sa.Uuid()),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_audit_events_actor_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["subject_user_id"],
            ["users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_audit_events_subject_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["tontine_id"],
            ["tontines.id"],
            ondelete="RESTRICT",
            name=op.f("fk_audit_events_tontine_id_tontines"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_events")),
        sa.CheckConstraint(
            "event_name ~ '^[a-z][a-z0-9_]*[.][a-z][a-z0-9_]*$'",
            name=op.f("ck_audit_events_event_name"),
        ),
        sa.CheckConstraint(
            "schema_version >= 1", name=op.f("ck_audit_events_schema_version")
        ),
        sa.CheckConstraint(
            "actor_type IN ('user', 'system')", name=op.f("ck_audit_events_actor_type")
        ),
        sa.CheckConstraint(
            "(actor_type = 'user' AND actor_user_id IS NOT NULL) OR (actor_type = 'system' AND actor_user_id IS NULL)",
            name=op.f("ck_audit_events_actor_consistency"),
        ),
        sa.CheckConstraint(
            "resource_type ~ '^[a-z][a-z0-9_]*$'",
            name=op.f("ck_audit_events_resource_type"),
        ),
    )
    op.create_index("ix_audit_events_occurred", "audit_events", ["occurred_at", "id"])
    op.create_index(
        "ix_audit_events_name_occurred", "audit_events", ["event_name", "occurred_at"]
    )
    op.create_index(
        "ix_audit_events_actor_occurred",
        "audit_events",
        ["actor_user_id", "occurred_at"],
    )
    op.create_index(
        "ix_audit_events_subject_occurred",
        "audit_events",
        ["subject_user_id", "occurred_at"],
    )
    op.create_index(
        "ix_audit_events_tontine_occurred",
        "audit_events",
        ["tontine_id", "occurred_at", "id"],
    )
    op.create_index(
        "ix_audit_events_resource",
        "audit_events",
        ["resource_type", "resource_id", "occurred_at"],
    )
    op.execute(
        """
        CREATE FUNCTION reject_audit_event_mutation()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'audit_events is append-only'
                USING ERRCODE = '55000';
        END;
        $$
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_audit_events_immutable
        BEFORE UPDATE OR DELETE ON audit_events
        FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation()
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_audit_events_immutable ON audit_events")
    op.execute("DROP FUNCTION IF EXISTS reject_audit_event_mutation()")
    op.drop_table("audit_events")
