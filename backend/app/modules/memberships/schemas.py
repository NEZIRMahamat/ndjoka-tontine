import re
from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator

from app.modules.memberships.enums import (
    InvitationStatus,
    MembershipRole,
    MembershipStatus,
)


def normalize_email(value: object) -> object:
    if not isinstance(value, str):
        return value
    email = value.strip().lower()
    if len(email) > 255 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise ValueError("Adresse e-mail invalide")
    return email


NormalizedEmail = Annotated[
    str, Field(min_length=3, max_length=255), BeforeValidator(normalize_email)
]


class InvitationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: NormalizedEmail
    role: MembershipRole = MembershipRole.MEMBER

    @field_validator("role")
    @classmethod
    def reject_owner(cls, value: MembershipRole) -> MembershipRole:
        if value == MembershipRole.OWNER:
            raise ValueError("Le rôle owner s'attribue uniquement par transfert")
        return value


class InvitationAccept(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=32, max_length=512)


class InvitationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tontine_id: UUID
    email: str
    role: MembershipRole
    status: InvitationStatus
    invited_by_user_id: UUID
    accepted_by_user_id: UUID | None
    created_at: datetime
    expires_at: datetime
    accepted_at: datetime | None
    revoked_at: datetime | None


class InvitationCreated(InvitationRead):
    token: str


class InvitationList(BaseModel):
    items: list[InvitationRead]
    total: int
    limit: int
    offset: int


class MembershipRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tontine_id: UUID
    user_id: UUID
    role: MembershipRole
    status: MembershipStatus
    joined_at: datetime
    updated_at: datetime
    ended_at: datetime | None


class MembershipList(BaseModel):
    items: list[MembershipRead]
    total: int
    limit: int
    offset: int


class MembershipRoleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: MembershipRole


class OwnershipTransfer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    new_owner_user_id: UUID
