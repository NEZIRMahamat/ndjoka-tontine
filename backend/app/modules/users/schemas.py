import re
from datetime import datetime
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    AnyHttpUrl,
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    ValidationError,
    field_validator,
    model_validator,
)

from app.modules.users.enums import GlobalRole, UserStatus

DISPLAY_NAME_MAX_LENGTH = 120
AVATAR_URL_MAX_LENGTH = 2048
LOCALE_MAX_LENGTH = 35
TIMEZONE_MAX_LENGTH = 64

_BCP47_SIMPLE_PATTERN = re.compile(r"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$")
_HTTP_URL_ADAPTER = TypeAdapter(AnyHttpUrl)


class UserRead(BaseModel):
    """Profil métier public d'un utilisateur Ndjoka."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str | None = Field(default=None, max_length=255)
    display_name: str | None = Field(
        default=None,
        max_length=DISPLAY_NAME_MAX_LENGTH,
    )
    avatar_url: str | None = Field(
        default=None,
        max_length=AVATAR_URL_MAX_LENGTH,
    )
    locale: str = Field(max_length=LOCALE_MAX_LENGTH)
    timezone: str = Field(max_length=TIMEZONE_MAX_LENGTH)
    status: UserStatus
    global_role: GlobalRole
    created_at: datetime
    updated_at: datetime
    deactivated_at: datetime | None = None


class CurrentUserResponse(UserRead):
    """Identité Auth0 et profil local de l'utilisateur connecté."""

    authenticated: Literal[True] = True
    sub: str = Field(min_length=1, max_length=255)
    permissions: list[str] = Field(default_factory=list)
    message: str


class UserProfileUpdate(BaseModel):
    """Champs de profil que l'utilisateur peut modifier lui-même."""

    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(
        default=None,
        max_length=DISPLAY_NAME_MAX_LENGTH,
    )
    avatar_url: str | None = Field(
        default=None,
        max_length=AVATAR_URL_MAX_LENGTH,
    )
    locale: str | None = Field(default=None, max_length=LOCALE_MAX_LENGTH)
    timezone: str | None = Field(default=None, max_length=TIMEZONE_MAX_LENGTH)

    @field_validator("display_name", mode="before")
    @classmethod
    def normalize_display_name(cls, value: object) -> object:
        if value is None or not isinstance(value, str):
            return value

        normalized = value.strip()
        if not normalized:
            raise ValueError("Le nom d'affichage ne peut pas être vide")
        return normalized

    @field_validator("avatar_url", mode="before")
    @classmethod
    def normalize_avatar_url(cls, value: object) -> object:
        if value is None or not isinstance(value, str):
            return value

        normalized = value.strip()
        if not normalized:
            raise ValueError("L'URL de l'avatar ne peut pas être vide")
        return normalized

    @field_validator("avatar_url")
    @classmethod
    def validate_avatar_url(cls, value: str | None) -> str | None:
        if value is None:
            return None

        try:
            validated_url = _HTTP_URL_ADAPTER.validate_python(value)
        except ValidationError as exc:
            raise ValueError(
                "L'URL de l'avatar doit être une URL HTTP ou HTTPS valide"
            ) from exc
        return str(validated_url)

    @field_validator("locale", mode="before")
    @classmethod
    def validate_locale(cls, value: object) -> object:
        if value is None:
            raise ValueError("La locale ne peut pas être nulle")
        if not isinstance(value, str):
            return value

        normalized = value.strip()
        if not _BCP47_SIMPLE_PATTERN.fullmatch(normalized):
            raise ValueError("La locale doit être un tag BCP 47 valide")
        return normalized

    @field_validator("timezone", mode="before")
    @classmethod
    def validate_timezone(cls, value: object) -> object:
        if value is None:
            raise ValueError("Le fuseau horaire ne peut pas être nul")
        if not isinstance(value, str):
            return value

        normalized = value.strip()
        try:
            ZoneInfo(normalized)
        except (ValueError, ZoneInfoNotFoundError) as exc:
            raise ValueError("Le fuseau horaire doit être un nom IANA valide") from exc
        return normalized

    @model_validator(mode="after")
    def require_at_least_one_field(self) -> "UserProfileUpdate":
        if not self.model_fields_set:
            raise ValueError("Au moins un champ de profil doit être fourni")
        return self


class AdminUserResponse(UserRead):
    """Profil complet visible par le support et les administrateurs."""

    auth0_sub: str = Field(min_length=1, max_length=255)


class UserListResponse(BaseModel):
    """Page d'utilisateurs retournée par l'administration."""

    items: list[AdminUserResponse]
    total: int = Field(ge=0)
    limit: int = Field(ge=1, le=100)
    offset: int = Field(ge=0)


class UserStatusUpdate(BaseModel):
    """Changement de statut réservé aux administrateurs de plateforme."""

    model_config = ConfigDict(extra="forbid")

    status: UserStatus


class UserRoleUpdate(BaseModel):
    """Changement de rôle réservé aux administrateurs de plateforme."""

    model_config = ConfigDict(extra="forbid")

    global_role: GlobalRole
