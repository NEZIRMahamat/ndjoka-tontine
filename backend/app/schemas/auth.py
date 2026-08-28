from pydantic import BaseModel, Field


class TokenPayload(BaseModel):
    """Claims vérifiés d'un Access Token émis par Auth0."""

    sub: str = Field(min_length=1)
    iss: str
    aud: str | list[str]
    exp: int
    iat: int
    scope: str | None = None
    permissions: list[str] = Field(default_factory=list)


class CurrentUserResponse(BaseModel):
    """Réponse temporaire représentant l'utilisateur Auth0 connecté."""

    authenticated: bool = True
    sub: str
    permissions: list[str] = Field(default_factory=list)
    message: str
