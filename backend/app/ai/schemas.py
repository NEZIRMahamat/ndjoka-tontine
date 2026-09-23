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


class ChatResponse(BaseModel):
    reply: str
