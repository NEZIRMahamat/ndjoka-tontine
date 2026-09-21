import base64
import json
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.modules.notifications.enums import NotificationStatus


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tontine_id: UUID | None
    event_name: str
    payload: dict
    action_path: str | None
    status: NotificationStatus
    read_at: datetime | None
    created_at: datetime


class NotificationPage(BaseModel):
    items: list[NotificationRead]
    next_cursor: str | None = None
    limit: int = Field(ge=1, le=100)


class UnreadCount(BaseModel):
    count: int = Field(ge=0)


class ReadAllResult(BaseModel):
    updated: int = Field(ge=0)


def encode_cursor(created_at: datetime, item_id: UUID) -> str:
    raw = json.dumps([created_at.isoformat(), str(item_id)]).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str | None) -> tuple[datetime, UUID] | None:
    if cursor is None:
        return None
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        created_at, item_id = json.loads(base64.urlsafe_b64decode(padded).decode())
        timestamp = datetime.fromisoformat(created_at)
        if timestamp.tzinfo is None:
            raise ValueError
        return timestamp, UUID(item_id)
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        raise ValueError("Curseur de notification invalide") from error
