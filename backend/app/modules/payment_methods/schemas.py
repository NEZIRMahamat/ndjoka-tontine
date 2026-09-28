import re
from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator

from app.modules.payment_methods.enums import PaymentMethodType


def strip_text(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


Label = Annotated[str, Field(min_length=2, max_length=60), BeforeValidator(strip_text)]


class PaymentMethodCreate(BaseModel):
    """Déclaration d'un moyen de paiement.

    ``identifier`` peut être un numéro complet saisi côté client : seul son
    condensé masqué (quatre derniers caractères) est conservé.
    """

    model_config = ConfigDict(extra="forbid")

    type: PaymentMethodType
    label: Label
    identifier: Annotated[str, Field(min_length=4, max_length=64)]
    make_default: bool = False

    @field_validator("identifier")
    @classmethod
    def normalize_identifier(cls, value: str) -> str:
        compact = re.sub(r"[\s\-\.]", "", value)
        if len(compact) < 4 or not re.fullmatch(r"[A-Za-z0-9+]+", compact):
            raise ValueError("Identifiant de moyen de paiement invalide")
        return compact

    @property
    def last4(self) -> str:
        return self.identifier[-4:].upper()


class PaymentMethodRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: PaymentMethodType
    label: str
    last4: str
    is_default: bool
    created_at: datetime
    updated_at: datetime


class PaymentMethodList(BaseModel):
    items: list[PaymentMethodRead]
    total: int
