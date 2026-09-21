from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.modules.audit.enums import AuditActorType


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        CheckConstraint(
            "event_name ~ '^[a-z][a-z0-9_]*[.][a-z][a-z0-9_]*$'", name="event_name"
        ),
        CheckConstraint("schema_version >= 1", name="schema_version"),
        CheckConstraint("actor_type IN ('user', 'system')", name="actor_type"),
        CheckConstraint(
            "(actor_type = 'user' AND actor_user_id IS NOT NULL) OR "
            "(actor_type = 'system' AND actor_user_id IS NULL)",
            name="actor_consistency",
        ),
        CheckConstraint("resource_type ~ '^[a-z][a-z0-9_]*$'", name="resource_type"),
        Index("ix_audit_events_occurred", "occurred_at", "id"),
        Index("ix_audit_events_name_occurred", "event_name", "occurred_at"),
        Index("ix_audit_events_actor_occurred", "actor_user_id", "occurred_at"),
        Index("ix_audit_events_subject_occurred", "subject_user_id", "occurred_at"),
        Index("ix_audit_events_tontine_occurred", "tontine_id", "occurred_at", "id"),
        Index(
            "ix_audit_events_resource", "resource_type", "resource_id", "occurred_at"
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    event_name: Mapped[str] = mapped_column(String(100), nullable=False)
    schema_version: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("1")
    )
    actor_type: Mapped[AuditActorType] = mapped_column(
        Enum(
            AuditActorType,
            native_enum=False,
            create_constraint=False,
            values_callable=lambda values: [value.value for value in values],
            length=10,
        ),
        nullable=False,
    )
    actor_user_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT")
    )
    subject_user_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT")
    )
    tontine_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("tontines.id", ondelete="RESTRICT")
    )
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    changes: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    context: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text('\'{"source":"api"}\'::jsonb')
    )
    request_id: Mapped[UUID | None] = mapped_column(Uuid)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
