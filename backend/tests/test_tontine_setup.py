from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.modules.cycles.enums import CycleFrequency
from app.modules.tontines.enums import TontineCategory, TurnOrderMode
from app.modules.tontines.schemas import TontineCreate, TontineSetup, TontineUpdate


def test_setup_splits_tontine_and_cycle_fields():
    payload = TontineSetup(
        name="Business Femmes",
        category="business",
        order_mode="lottery",
        city=" Paris ",
        goal="",
        max_members=8,
        is_discoverable=True,
        contribution_amount="200.00",
        frequency="monthly",
        start_date=date(2026, 11, 5),
        cover_image_url=" https://example.com/cover.jpg ",
    )
    tontine = payload.tontine_payload()
    assert isinstance(tontine, TontineCreate)
    assert tontine.category is TontineCategory.BUSINESS
    assert tontine.order_mode is TurnOrderMode.LOTTERY
    assert tontine.city == "Paris"
    assert tontine.goal is None
    assert tontine.cover_image_url == "https://example.com/cover.jpg"
    assert payload.contribution_amount == Decimal("200.00")
    assert payload.frequency is CycleFrequency.MONTHLY
    assert payload.timezone == "Europe/Paris"


@pytest.mark.parametrize(
    "fields",
    [
        {"contribution_amount": "0"},
        {"category": "crypto"},
        {"order_mode": "random"},
        {"timezone": "Mars/Olympus"},
        {"cover_image_url": "ftp://example.com/x.png"},
        {"status": "active"},
    ],
)
def test_setup_rejects_invalid_fields(fields):
    with pytest.raises(ValidationError):
        TontineSetup.model_validate(
            {
                "name": "Ma tontine",
                "contribution_amount": "100",
                "start_date": "2026-11-01",
                **fields,
            }
        )


def test_create_defaults_are_conservative():
    payload = TontineCreate(name="Famille")
    assert payload.category is TontineCategory.OTHER
    assert payload.order_mode is TurnOrderMode.REGISTRATION
    assert payload.late_penalty_enabled is False
    assert payload.is_discoverable is False


@pytest.mark.parametrize("field", ["category", "order_mode", "late_penalty_enabled"])
def test_update_rejects_null_for_required_group_rules(field):
    with pytest.raises(ValidationError):
        TontineUpdate.model_validate({field: None})
