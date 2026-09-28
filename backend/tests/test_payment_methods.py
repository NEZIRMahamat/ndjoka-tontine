from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.modules.payment_methods.enums import PaymentMethodType
from app.modules.payment_methods.models import PaymentMethod
from app.modules.payment_methods.schemas import PaymentMethodCreate, PaymentMethodRead


def test_create_keeps_only_last_four_characters():
    payload = PaymentMethodCreate(
        type="card", label=" Visa ", identifier="4242 4242 4242 4242"
    )
    assert payload.label == "Visa"
    assert payload.last4 == "4242"
    assert payload.make_default is False


def test_iban_last4_is_uppercased():
    payload = PaymentMethodCreate(
        type="sepa",
        label="Compte courant",
        identifier="FR76 3000 6000 0112 3456 7890 189",
    )
    assert payload.last4 == "0189"


@pytest.mark.parametrize(
    "fields",
    [
        {"identifier": "12"},
        {"identifier": "abc$1234"},
        {"label": "x"},
        {"type": "bitcoin"},
        {"last4": "1234"},
    ],
)
def test_create_rejects_invalid_or_server_fields(fields):
    with pytest.raises(ValidationError):
        PaymentMethodCreate.model_validate(
            {
                "type": "card",
                "label": "Visa",
                "identifier": "4242424242424242",
                **fields,
            }
        )


def test_read_never_exposes_full_identifier():
    now = datetime.now(UTC)
    item = PaymentMethod(
        id=uuid4(),
        user_id=uuid4(),
        type=PaymentMethodType.MOBILE_MONEY,
        label="Orange Money",
        last4="5678",
        is_default=True,
        created_at=now,
        updated_at=now,
    )
    payload = PaymentMethodRead.model_validate(item).model_dump()
    assert payload["last4"] == "5678"
    assert "identifier" not in payload and "user_id" not in payload
