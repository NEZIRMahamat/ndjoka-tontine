from datetime import date, datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator

from app.modules.cycles.enums import CycleFrequency, CycleStatus


def strip_text(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


Name = Annotated[str, Field(min_length=3, max_length=120), BeforeValidator(strip_text)]
Amount = Annotated[Decimal, Field(gt=0, max_digits=18, decimal_places=2)]


class CycleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name
    contribution_amount: Amount
    frequency: CycleFrequency
    start_date: date
    timezone: str = Field(default="Europe/Paris", min_length=1, max_length=64)
    beneficiary_contributes: bool = True

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        value = value.strip()
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("Le fuseau horaire doit être un nom IANA valide") from exc
        return value


class CycleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name | None = None
    contribution_amount: Amount | None = None
    frequency: CycleFrequency | None = None
    start_date: date | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    beneficiary_contributes: bool | None = None

    @field_validator(
        "name",
        "contribution_amount",
        "frequency",
        "start_date",
        "timezone",
        "beneficiary_contributes",
        mode="before",
    )
    @classmethod
    def reject_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("Ce champ ne peut pas être nul")
        return value

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("Le fuseau horaire doit être un nom IANA valide") from exc
        return value


class TurnOrderUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    membership_ids: list[UUID] = Field(min_length=1, max_length=1000)

    @field_validator("membership_ids")
    @classmethod
    def unique_memberships(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("Un bénéficiaire ne peut apparaître qu'une fois")
        return value


class CycleTurnRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    cycle_id: UUID
    position: int
    beneficiary_membership_id: UUID
    scheduled_for: datetime
    created_at: datetime
    updated_at: datetime


class CycleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tontine_id: UUID
    sequence_number: int
    name: str
    contribution_amount: Decimal
    frequency: CycleFrequency
    start_date: date
    timezone: str
    beneficiary_contributes: bool
    status: CycleStatus
    created_by_user_id: UUID
    activated_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    created_at: datetime
    updated_at: datetime
    turns: list[CycleTurnRead] = Field(default_factory=list)


class CycleList(BaseModel):
    items: list[CycleRead]
    total: int
    limit: int
    offset: int
