from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
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
from app.modules.notifications.enums import (
    EmailDeliveryStatus,
    NotificationStatus,
    OutboxStatus,
)


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint("status IN ('unread','read')", name="status"),
        CheckConstraint(
            "(status = 'read') = (read_at IS NOT NULL)", name="read_consistency"
        ),
        Index("uq_notifications_deduplication_key", "deduplication_key", unique=True),
        Index(
            "ix_notifications_recipient_created",
            "recipient_user_id",
            "created_at",
            "id",
        ),
        Index(
            "ix_notifications_recipient_status",
            "recipient_user_id",
            "status",
            "created_at",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    recipient_user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    tontine_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("tontines.id", ondelete="RESTRICT")
    )
    event_name: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    action_path: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[NotificationStatus] = mapped_column(
        String(10), nullable=False, server_default=text("'unread'")
    )
    deduplication_key: Mapped[str] = mapped_column(String(255), nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class OutboxEvent(Base):
    __tablename__ = "outbox_events"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','processing','processed','failed','dead')",
            name="status",
        ),
        CheckConstraint(
            "attempt_count >= 0 AND attempt_count <= 3", name="attempt_count"
        ),
        Index("uq_outbox_events_deduplication_key", "deduplication_key", unique=True),
        Index("ix_outbox_events_due", "status", "next_attempt_at", "created_at", "id"),
        Index("ix_outbox_events_aggregate", "aggregate_type", "aggregate_id"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    event_name: Mapped[str] = mapped_column(String(100), nullable=False)
    aggregate_type: Mapped[str] = mapped_column(String(50), nullable=False)
    aggregate_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    tontine_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("tontines.id", ondelete="RESTRICT")
    )
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    deduplication_key: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[OutboxStatus] = mapped_column(
        String(20), nullable=False, server_default=text("'pending'")
    )
    attempt_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class EmailDelivery(Base):
    __tablename__ = "email_deliveries"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','accepted','delivered','bounced','complained','failed','dead')",
            name="status",
        ),
        CheckConstraint(
            "attempt_count >= 0 AND attempt_count <= 3", name="attempt_count"
        ),
        Index("uq_email_deliveries_idempotency_key", "idempotency_key", unique=True),
        Index(
            "uq_email_deliveries_resend_email_id",
            "resend_email_id",
            unique=True,
            postgresql_where=text("resend_email_id IS NOT NULL"),
        ),
        Index("ix_email_deliveries_due", "status", "next_attempt_at", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    notification_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("notifications.id", ondelete="CASCADE")
    )
    resend_email_id: Mapped[str | None] = mapped_column(String(255))
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[EmailDeliveryStatus] = mapped_column(
        String(20), nullable=False, server_default=text("'pending'")
    )
    attempt_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_error_code: Mapped[str | None] = mapped_column(String(100))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class ResendWebhookEvent(Base):
    __tablename__ = "resend_webhook_events"
    __table_args__ = (
        Index("uq_resend_webhook_events_svix_id", "svix_id", unique=True),
        Index("ix_resend_webhook_events_email", "resend_email_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    svix_id: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    resend_email_id: Mapped[str | None] = mapped_column(String(255))
    provider_occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
