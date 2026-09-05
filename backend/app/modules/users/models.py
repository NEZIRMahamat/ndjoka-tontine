from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, Enum, String, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.modules.users.enums import GlobalRole, UserStatus

AUTH0_SUB_MAX_LENGTH = 255
DEFAULT_USER_LOCALE = "fr"
DEFAULT_USER_TIMEZONE = "Europe/Paris"
USER_STATUS_TYPE = Enum(
    UserStatus,
    native_enum=False,
    create_constraint=False,
    validate_strings=True,
    values_callable=lambda enum: [member.value for member in enum],
    length=30,
)
GLOBAL_ROLE_TYPE = Enum(
    GlobalRole,
    native_enum=False,
    create_constraint=False,
    validate_strings=True,
    values_callable=lambda enum: [member.value for member in enum],
    length=30,
)


class User(Base):
    """Utilisateur Ndjoka identifié de manière canonique par Auth0."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'suspended', 'deactivated')",
            name="status",
        ),
        CheckConstraint(
            "global_role IN ('user', 'support', 'platform_admin')",
            name="global_role",
        ),
        CheckConstraint(
            "status != 'deactivated' OR deactivated_at IS NOT NULL",
            name="deactivated_at_required",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    auth0_sub: Mapped[str] = mapped_column(
        String(AUTH0_SUB_MAX_LENGTH),
        nullable=False,
        unique=True,
    )
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    locale: Mapped[str] = mapped_column(
        String(35),
        nullable=False,
        default=DEFAULT_USER_LOCALE,
        server_default=text("'fr'"),
    )
    timezone: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default=DEFAULT_USER_TIMEZONE,
        server_default=text("'Europe/Paris'"),
    )
    status: Mapped[UserStatus] = mapped_column(
        USER_STATUS_TYPE,
        nullable=False,
        default=UserStatus.ACTIVE,
        server_default=text("'active'"),
    )
    global_role: Mapped[GlobalRole] = mapped_column(
        GLOBAL_ROLE_TYPE,
        nullable=False,
        default=GlobalRole.USER,
        server_default=text("'user'"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    deactivated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
