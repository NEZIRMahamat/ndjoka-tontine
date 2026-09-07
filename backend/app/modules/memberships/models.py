from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.modules.memberships.enums import (
    InvitationStatus,
    MembershipRole,
    MembershipStatus,
)

if TYPE_CHECKING:
    from app.modules.tontines.models import Tontine
    from app.modules.users.models import User


def enum_type(enum: type, length: int) -> Enum:
    return Enum(
        enum,
        native_enum=False,
        create_constraint=False,
        validate_strings=True,
        values_callable=lambda values: [value.value for value in values],
        length=length,
    )


class Membership(Base):
    """Adhésion unique d'un utilisateur à une tontine."""

    __tablename__ = "memberships"
    __table_args__ = (
        CheckConstraint(
            "role IN ('owner', 'manager', 'treasurer', 'member')", name="role"
        ),
        CheckConstraint("status IN ('active', 'left', 'removed')", name="status"),
        CheckConstraint(
            "(status = 'active' AND ended_at IS NULL) OR "
            "(status IN ('left', 'removed') AND ended_at IS NOT NULL)",
            name="end_consistency",
        ),
        Index("uq_memberships_tontine_user", "tontine_id", "user_id", unique=True),
        Index(
            "uq_memberships_one_active_owner",
            "tontine_id",
            unique=True,
            postgresql_where=text("role = 'owner' AND status = 'active'"),
        ),
        Index("ix_memberships_user_status_tontine", "user_id", "status", "tontine_id"),
        Index(
            "ix_memberships_tontine_status_joined",
            "tontine_id",
            "status",
            "joined_at",
            "id",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    tontine_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("tontines.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    role: Mapped[MembershipRole] = mapped_column(
        enum_type(MembershipRole, 20), nullable=False
    )
    status: Mapped[MembershipStatus] = mapped_column(
        enum_type(MembershipStatus, 20), nullable=False, server_default=text("'active'")
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    tontine: Mapped[Tontine] = relationship(foreign_keys=[tontine_id])
    user: Mapped[User] = relationship(foreign_keys=[user_id])


class Invitation(Base):
    """Invitation dont seul le condensat du token secret est conservé."""

    __tablename__ = "invitations"
    __table_args__ = (
        CheckConstraint("role IN ('manager', 'treasurer', 'member')", name="role"),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'expired', 'revoked')", name="status"
        ),
        CheckConstraint("email = lower(btrim(email))", name="email_normalized"),
        CheckConstraint("char_length(token_hash) = 64", name="token_hash_length"),
        CheckConstraint("expires_at > created_at", name="expiry_after_creation"),
        CheckConstraint(
            "(status = 'accepted') = (accepted_at IS NOT NULL AND accepted_by_user_id IS NOT NULL)",
            name="acceptance_consistency",
        ),
        CheckConstraint(
            "(status = 'revoked') = (revoked_at IS NOT NULL)",
            name="revocation_consistency",
        ),
        Index("uq_invitations_token_hash", "token_hash", unique=True),
        Index(
            "uq_invitations_pending_email",
            "tontine_id",
            "email",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
        Index("ix_invitations_tontine_created", "tontine_id", "created_at", "id"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid, primary_key=True, server_default=text("gen_random_uuid()")
    )
    tontine_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("tontines.id", ondelete="CASCADE"), nullable=False
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[MembershipRole] = mapped_column(
        enum_type(MembershipRole, 20), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[InvitationStatus] = mapped_column(
        enum_type(InvitationStatus, 20),
        nullable=False,
        server_default=text("'pending'"),
    )
    invited_by_user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    accepted_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    tontine: Mapped[Tontine] = relationship(foreign_keys=[tontine_id])
    invited_by: Mapped[User] = relationship(foreign_keys=[invited_by_user_id])
    accepted_by: Mapped[User | None] = relationship(foreign_keys=[accepted_by_user_id])
