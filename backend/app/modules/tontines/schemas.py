from datetime import datetime
from typing import Annotated
from uuid import UUID

import pycountry
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator

from app.modules.tontines.enums import TontineStatus


def strip_text(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


def optional_text(value: object) -> object:
    if isinstance(value, str):
        return value.strip() or None
    return value


def currency_code(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("La devise doit être un code ISO 4217")
    code = value.strip().upper()
    if pycountry.currencies.get(alpha_3=code) is None:
        raise ValueError("Code devise ISO 4217 inconnu")
    return code


Name = Annotated[str, Field(min_length=3, max_length=120), BeforeValidator(strip_text)]
Currency = Annotated[str, BeforeValidator(currency_code)]
MemberLimit = Annotated[int, Field(strict=True, ge=2, le=2_147_483_647)]
Description = Annotated[
    str | None,
    Field(max_length=5000),
    BeforeValidator(optional_text),
]


class TontineCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name
    description: Description = None
    currency: Currency = "EUR"
    max_members: MemberLimit | None = None


class TontineUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name | None = None
    description: Description = None
    currency: Currency | None = None
    max_members: MemberLimit | None = None

    @field_validator("name", "currency", mode="before")
    @classmethod
    def reject_explicit_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("Ce champ ne peut pas être nul")
        return value


class TontineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    description: str | None
    currency: str
    max_members: int | None
    status: TontineStatus
    created_by_user_id: UUID
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class TontineList(BaseModel):
    items: list[TontineRead]
    total: int
    limit: int
    offset: int
