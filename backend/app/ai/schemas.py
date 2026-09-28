from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

MessageRole = Literal["user", "assistant"]


class ChatMessage(BaseModel):
    """Message de conversation. Le rôle ``system`` ne peut jamais venir du client."""

    model_config = ConfigDict(extra="forbid")

    role: MessageRole
    content: str = Field(min_length=1, max_length=4000)

    @field_validator("content")
    @classmethod
    def strip_content(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Le message ne peut pas être vide")
        return stripped


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    messages: list[ChatMessage] = Field(min_length=1, max_length=40)

    @field_validator("messages")
    @classmethod
    def validate_last_is_user(cls, value: list[ChatMessage]) -> list[ChatMessage]:
        if value[-1].role != "user":
            raise ValueError("Le dernier message doit provenir de l'utilisateur")
        return value


class RecommendedTontine(BaseModel):
    """Carte de tontine ouverte proposée par l'assistant."""

    id: str
    name: str
    description: str | None = None
    category: str
    city: str | None = None
    currency: str
    contribution_amount: float | None = None
    frequency: str | None = None
    monthly_equivalent: float | None = None
    seats_left: int | None = None
    member_count: int
    max_members: int | None = None
    affinity_score: float
    is_eligible: bool
    ineligibility_reason: str | None = None
    reasons: list[str] = Field(default_factory=list)
    cover_image_url: str | None = None


class ChatResponse(BaseModel):
    reply: str
    recommendations: list[RecommendedTontine] | None = None
