import asyncio
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.modules.contributions.enums import ContributionStatus
from app.modules.cycles.enums import CycleStatus
from app.modules.memberships.enums import MembershipRole
from app.modules.payouts import repositories, services
from app.modules.payouts.enums import PayoutStatus
from app.modules.payouts.models import Payout
from app.modules.payouts.schemas import (
    PayoutApprove,
    PayoutCancel,
    PayoutDispute,
    PayoutResolveDispute,
)


@pytest.mark.parametrize(
    "schema,field",
    [
        (PayoutDispute, "reason"),
        (PayoutCancel, "reason"),
        (PayoutResolveDispute, "resolution_note"),
    ],
)
@pytest.mark.parametrize("value", ["", "  ", "ab", "x" * 2001])
def test_reason_required(schema, field, value):
    with pytest.raises(ValidationError):
        schema(**{field: value})


@pytest.mark.parametrize(
    "amount", ["0", "-1", "1.001", "NaN", "Infinity", "10000000000000000"]
)
def test_invalid_amount(amount):
    with pytest.raises(ValidationError):
        PayoutApprove(approved_amount=amount)


@pytest.mark.parametrize("role", list(MembershipRole))
@pytest.mark.parametrize(
    "action,roles",
    [
        ("approve", {"owner", "manager"}),
        ("declare-paid", {"owner", "treasurer"}),
        ("resolve-dispute", {"owner", "manager"}),
        ("cancel", {"owner"}),
        ("refresh-readiness", {"owner", "manager", "treasurer", "member"}),
    ],
)
def test_role_matrix(role, action, roles):
    membership = SimpleNamespace(id=uuid4(), role=role)
    item = SimpleNamespace(beneficiary_membership_id=uuid4())
    if role.value in roles:
        services.authorize_action(action, item, membership)
    else:
        with pytest.raises(services.PayoutError) as error:
            services.authorize_action(action, item, membership)
        assert error.value.status_code == 403


@pytest.mark.parametrize("role", list(MembershipRole))
@pytest.mark.parametrize("action", ["confirm-receipt", "dispute"])
def test_beneficiary_is_not_a_role_override(role, action):
    membership = SimpleNamespace(id=uuid4(), role=role)
    with pytest.raises(services.PayoutError):
        services.authorize_action(
            action, SimpleNamespace(beneficiary_membership_id=uuid4()), membership
        )
    services.authorize_action(
        action, SimpleNamespace(beneficiary_membership_id=membership.id), membership
    )


@pytest.mark.parametrize(
    "case,ready",
    [
        ("complete", True),
        ("missing", False),
        ("declared", False),
        ("future", False),
        ("cancelled", False),
        ("zero", False),
        ("wrong_member", False),
    ],
)
def test_readiness_checks_exact_obligations(monkeypatch, case, ready):
    beneficiary, other = uuid4(), uuid4()
    item = SimpleNamespace(
        turn_id=uuid4(),
        beneficiary_membership_id=beneficiary,
        expected_amount=Decimal("20"),
        available_amount=Decimal("0"),
        status=PayoutStatus.PENDING,
        scheduled_for=datetime.now(UTC) - timedelta(days=1),
    )
    cycle = SimpleNamespace(
        status=CycleStatus.ACTIVE,
        beneficiary_contributes=True,
        turns=[
            SimpleNamespace(beneficiary_membership_id=x) for x in [beneficiary, other]
        ],
    )
    entries = [
        SimpleNamespace(
            membership_id=x,
            amount_due=Decimal("10"),
            status=ContributionStatus.CONFIRMED,
        )
        for x in [beneficiary, other]
    ]
    if case == "missing":
        entries.pop()
    if case == "declared":
        entries[0].status = ContributionStatus.DECLARED
    if case == "future":
        item.scheduled_for = datetime.now(UTC) + timedelta(days=1)
    if case == "cancelled":
        cycle.status = CycleStatus.CANCELLED
    if case == "zero":
        entries = []
        item.expected_amount = Decimal("0")
        cycle.turns = []
    if case == "wrong_member":
        entries[0].membership_id = uuid4()
    monkeypatch.setattr(repositories, "obligations", AsyncMock(return_value=entries))
    assert asyncio.run(services.refresh(AsyncMock(), item, cycle)) is ready
    assert item.status == (PayoutStatus.READY if ready else PayoutStatus.PENDING)
    assert item.available_amount == sum(
        (e.amount_due for e in entries if e.status == ContributionStatus.CONFIRMED),
        Decimal("0"),
    )


def test_internal_details_are_omitted():
    now = datetime.now(UTC)
    beneficiary = uuid4()
    item = Payout(
        id=uuid4(),
        tontine_id=uuid4(),
        cycle_id=uuid4(),
        turn_id=uuid4(),
        beneficiary_membership_id=beneficiary,
        expected_amount=Decimal("20"),
        available_amount=Decimal("20"),
        currency="EUR",
        status=PayoutStatus.PENDING,
        scheduled_for=now,
        created_at=now,
        updated_at=now,
        external_reference="private",
        payment_note="private",
    )
    member = SimpleNamespace(id=uuid4(), role=MembershipRole.MEMBER)
    result = services.read_item(item, member).model_dump(exclude_unset=True)
    assert not (services.PRIVATE & result.keys())
    member.id = beneficiary
    assert services.read_item(item, member).external_reference == "private"


def test_all_payout_routes_require_authentication_and_document_conflicts():
    client = TestClient(app)
    paths = app.openapi()["paths"]
    selected = {path: methods for path, methods in paths.items() if "payouts" in path}
    assert len(selected) == 12
    for path, methods in selected.items():
        for method, definition in methods.items():
            assert definition["security"] == [{"Auth0Bearer": []}]
            assert "409" in definition["responses"]
            concrete = (
                path.replace("{payout_id}", str(uuid4()))
                .replace("{tontine_id}", str(uuid4()))
                .replace("{cycle_id}", str(uuid4()))
            )
            assert client.request(method, concrete).status_code == 401
