from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.modules.audit.enums import AuditActorType


class AuditEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    event_name: str
    schema_version: int
    actor_type: AuditActorType
    actor_user_id: UUID | None
    subject_user_id: UUID | None
    tontine_id: UUID | None
    resource_type: str
    resource_id: UUID
    changes: dict
    context: dict
    request_id: UUID | None
    occurred_at: datetime


class AuditEventList(BaseModel):
    items: list[AuditEventRead]
    next_cursor: str | None = None
    limit: int = Field(ge=1, le=100)
