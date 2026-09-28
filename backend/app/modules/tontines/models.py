from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.modules.tontines.enums import TontineCategory, TontineStatus, TurnOrderMode


def enum_type(enum: type, length: int) -> Enum:
    return Enum(
        enum,
        native_enum=False,
        create_constraint=False,
        validate_strings=True,
        values_callable=lambda values: [value.value for value in values],
        length=length,
    )


class Tontine(Base):
    """Groupe de tontine : identité, règles du groupe et visibilité."""

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
        CheckConstraint(
            "min_reliability_score IS NULL "
            "OR (min_reliability_score >= 0 AND min_reliability_score <= 1)",
            name="min_reliability_range",
        ),
        CheckConstraint(
            "category IN ('business', 'family', 'travel', 'solidarity', "
            "'housing', 'education', 'other')",
            name="category",
        ),
        CheckConstraint(
            "order_mode IN ('lottery', 'registration', 'vote')", name="order_mode"
        ),
        Index(
            "ix_tontines_creator_created_id", "created_by_user_id", "created_at", "id"
        ),
        Index(
            "ix_tontines_discoverable",
            "status",
            "created_at",
            "id",
            postgresql_where=text("is_discoverable"),
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
    is_discoverable: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    min_reliability_score: Mapped[Decimal | None] = mapped_column(
        Numeric(4, 3), nullable=True
    )
    category: Mapped[TontineCategory] = mapped_column(
        enum_type(TontineCategory, 20),
        nullable=False,
        default=TontineCategory.OTHER,
        server_default=text("'other'"),
    )
    goal: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    order_mode: Mapped[TurnOrderMode] = mapped_column(
        enum_type(TurnOrderMode, 20),
        nullable=False,
        default=TurnOrderMode.REGISTRATION,
        server_default=text("'registration'"),
    )
    rules: Mapped[str | None] = mapped_column(Text, nullable=True)
    late_penalty_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    cover_image_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    status: Mapped[TontineStatus] = mapped_column(
        enum_type(TontineStatus, 20),
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
