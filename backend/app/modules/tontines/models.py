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
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.modules.tontines.enums import TontineStatus


class Tontine(Base):
    """Projet de tontine appartenant à son créateur pendant le Sprint 2."""

    __tablename__ = "tontines"
    __table_args__ = (
        CheckConstraint(
            "char_length(btrim(name)) BETWEEN 3 AND 120", name="name_length"
        ),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_format"),
        CheckConstraint("max_members IS NULL OR max_members >= 2", name="max_members"),
        CheckConstraint("status IN ('draft', 'active', 'archived')", name="status"),
        CheckConstraint(
            "(status = 'archived') = (archived_at IS NOT NULL)",
            name="archive_consistency",
        ),
        Index(
            "ix_tontines_creator_created_id", "created_by_user_id", "created_at", "id"
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, server_default=text("'EUR'")
    )
    max_members: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[TontineStatus] = mapped_column(
        Enum(
            TontineStatus,
            native_enum=False,
            create_constraint=False,
            validate_strings=True,
            values_callable=lambda values: [value.value for value in values],
            length=20,
        ),
        nullable=False,
        server_default=text("'draft'"),
    )
    created_by_user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
