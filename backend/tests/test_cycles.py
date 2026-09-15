from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.modules.cycles.enums import CycleFrequency, CycleStatus
from app.modules.cycles.models import Cycle
from app.modules.cycles.schemas import CycleCreate, TurnOrderUpdate
from app.modules.cycles.services import (
    CycleError,
    add_months,
    require_draft,
    require_role,
    scheduled_datetime,
)
from app.modules.memberships.enums import MembershipRole, MembershipStatus
from app.modules.memberships.models import Membership


def make_cycle(frequency: CycleFrequency = CycleFrequency.WEEKLY) -> Cycle:
    now = datetime.now(UTC)
    return Cycle(
        id=uuid4(),
        tontine_id=uuid4(),
        sequence_number=1,
        name="Cycle principal",
        contribution_amount=Decimal("125.50"),
        frequency=frequency,
        start_date=date(2026, 1, 31),
        timezone="Europe/Paris",
        beneficiary_contributes=True,
        status=CycleStatus.DRAFT,
        created_by_user_id=uuid4(),
        created_at=now,
        updated_at=now,
    )


def make_membership(role: MembershipRole) -> Membership:
    return Membership(
        id=uuid4(),
        tontine_id=uuid4(),
        user_id=uuid4(),
        role=role,
        status=MembershipStatus.ACTIVE,
    )


def test_cycle_schema_uses_decimal_and_validates_timezone():
    payload = CycleCreate(
        name="  Cycle famille  ",
        contribution_amount="120.50",
        frequency="weekly",
        start_date="2026-10-01",
    )
    assert payload.name == "Cycle famille"
    assert payload.contribution_amount == Decimal("120.50")
    with pytest.raises(ValidationError):
        CycleCreate(
            name="Cycle",
            contribution_amount=0,
            frequency="weekly",
            start_date="2026-10-01",
            timezone="Mars/Olympus",
        )


def test_turn_order_rejects_duplicate_beneficiary():
    membership_id = uuid4()
    with pytest.raises(ValidationError):
        TurnOrderUpdate(membership_ids=[membership_id, membership_id])


def test_weekly_and_monthly_calendar_are_deterministic():
    weekly = make_cycle()
    assert scheduled_datetime(weekly, 2).astimezone(
        ZoneInfo("Europe/Paris")
    ).date() == date(2026, 2, 7)
    monthly = make_cycle(CycleFrequency.MONTHLY)
    assert add_months(monthly.start_date, 1) == date(2026, 2, 28)
    assert scheduled_datetime(monthly, 2).astimezone(
        ZoneInfo("Europe/Paris")
    ).date() == date(2026, 2, 28)


def test_cycle_permissions_and_draft_lock():
    require_role(
        make_membership(MembershipRole.MANAGER),
        MembershipRole.OWNER,
        MembershipRole.MANAGER,
    )
    with pytest.raises(CycleError) as denied:
        require_role(
            make_membership(MembershipRole.MEMBER),
            MembershipRole.OWNER,
            MembershipRole.MANAGER,
        )
    assert denied.value.status_code == 403
    cycle = make_cycle()
    cycle.status = CycleStatus.SCHEDULED
    with pytest.raises(CycleError) as locked:
        require_draft(cycle)
    assert locked.value.status_code == 409


def test_openapi_documents_all_cycle_routes():
    schema = TestClient(app).get("/openapi.json").json()
    expected = {
        "/api/v1/tontines/{tontine_id}/cycles": {"get", "post"},
        "/api/v1/tontines/{tontine_id}/cycles/{cycle_id}": {"get", "patch"},
        "/api/v1/tontines/{tontine_id}/cycles/{cycle_id}/turns/generate": {"post"},
        "/api/v1/tontines/{tontine_id}/cycles/{cycle_id}/turns": {"put"},
        "/api/v1/tontines/{tontine_id}/cycles/{cycle_id}/schedule": {"post"},
        "/api/v1/tontines/{tontine_id}/cycles/{cycle_id}/activate": {"post"},
        "/api/v1/tontines/{tontine_id}/cycles/{cycle_id}/complete": {"post"},
        "/api/v1/tontines/{tontine_id}/cycles/{cycle_id}/cancel": {"post"},
    }
    for path, methods in expected.items():
        assert methods <= schema["paths"][path].keys()
        for method in methods:
            assert schema["paths"][path][method]["security"] == [{"Auth0Bearer": []}]
