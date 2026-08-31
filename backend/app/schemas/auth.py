from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class TokenPayload(BaseModel):
    """Claims vérifiés d'un Access Token émis par Auth0."""

    sub: str = Field(min_length=1, max_length=255)
    iss: str
    aud: str | list[str]
    exp: int
    iat: int
    scope: str | None = None
    permissions: list[str] = Field(default_factory=list)


class CurrentUserResponse(BaseModel):
    """Identité Auth0 et profil local de l'utilisateur Ndjoka connecté."""

    authenticated: bool = True
    id: UUID
    sub: str
    email: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime
    permissions: list[str] = Field(default_factory=list)
    message: str
