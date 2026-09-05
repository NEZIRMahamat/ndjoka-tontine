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
    email: str | None = Field(default=None, min_length=1, max_length=255)
