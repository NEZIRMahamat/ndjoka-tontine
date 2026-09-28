from datetime import date, datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import pycountry
from pydantic import (
    AnyHttpUrl,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    TypeAdapter,
    ValidationError,
    field_validator,
)

from app.modules.cycles.enums import CycleFrequency
from app.modules.cycles.schemas import CycleRead
from app.modules.tontines.enums import TontineCategory, TontineStatus, TurnOrderMode

_HTTP_URL_ADAPTER = TypeAdapter(AnyHttpUrl)


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


def optional_http_url(value: object) -> object:
    if not isinstance(value, str):
        return value
    normalized = value.strip()
    if not normalized:
        return None
    try:
        return str(_HTTP_URL_ADAPTER.validate_python(normalized))
    except ValidationError as exc:
        raise ValueError("L'image de couverture doit être une URL HTTP(S)") from exc


Name = Annotated[str, Field(min_length=3, max_length=120), BeforeValidator(strip_text)]
Currency = Annotated[str, BeforeValidator(currency_code)]
MemberLimit = Annotated[int, Field(strict=True, ge=2, le=2_147_483_647)]
ReliabilityGate = Annotated[Decimal, Field(ge=0, le=1, decimal_places=3)]
Description = Annotated[
    str | None,
    Field(max_length=5000),
    BeforeValidator(optional_text),
]
ShortText = Annotated[str | None, Field(max_length=255), BeforeValidator(optional_text)]
CityText = Annotated[str | None, Field(max_length=120), BeforeValidator(optional_text)]
CoverImage = Annotated[
    str | None, Field(max_length=2048), BeforeValidator(optional_http_url)
]


class TontineCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name
    description: Description = None
    currency: Currency = "EUR"
    max_members: MemberLimit | None = None
    is_discoverable: bool = False
    min_reliability_score: ReliabilityGate | None = None
    category: TontineCategory = TontineCategory.OTHER
    goal: ShortText = None
    city: CityText = None
    order_mode: TurnOrderMode = TurnOrderMode.REGISTRATION
    rules: Description = None
    late_penalty_enabled: bool = False
    cover_image_url: CoverImage = None


class TontineUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name | None = None
    description: Description = None
    currency: Currency | None = None
    max_members: MemberLimit | None = None
    is_discoverable: bool | None = None
    min_reliability_score: ReliabilityGate | None = None
    category: TontineCategory | None = None
    goal: ShortText = None
    city: CityText = None
    order_mode: TurnOrderMode | None = None
    rules: Description = None
    late_penalty_enabled: bool | None = None
    cover_image_url: CoverImage = None

    @field_validator(
        "name",
        "currency",
        "is_discoverable",
        "category",
        "order_mode",
        "late_penalty_enabled",
        mode="before",
    )
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
    is_discoverable: bool
    min_reliability_score: Decimal | None
    category: TontineCategory
    goal: str | None
    city: str | None
    order_mode: TurnOrderMode
    rules: str | None
    late_penalty_enabled: bool
    cover_image_url: str | None
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


class TontineSetup(TontineCreate):
    """Création guidée : la tontine et son premier cycle en une seule étape."""

    contribution_amount: Decimal = Field(gt=0, max_digits=18, decimal_places=2)
    frequency: CycleFrequency = CycleFrequency.MONTHLY
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

    def tontine_payload(self) -> TontineCreate:
        return TontineCreate.model_validate(
            self.model_dump(include=set(TontineCreate.model_fields))
        )


class TontineSetupRead(BaseModel):
    tontine: TontineRead
    cycle: CycleRead
