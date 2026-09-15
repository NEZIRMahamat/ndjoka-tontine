from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.modules.contributions.enums import (
    ContributionStatus,
    EffectiveContributionStatus,
)
from app.modules.contributions.models import Contribution
from app.modules.contributions.schemas import ContributionReject
from app.modules.contributions.services import (
    ContributionError,
    effective_status,
    require_financial_role,
    require_generation_role,
)
from app.modules.memberships.enums import MembershipRole, MembershipStatus
from app.modules.memberships.models import Membership


def make_contribution(status=ContributionStatus.PENDING, due_delta=timedelta(days=1)):
    now = datetime.now(UTC)
    return Contribution(
        id=uuid4(),
        cycle_id=uuid4(),
        turn_id=uuid4(),
        membership_id=uuid4(),
        amount_due=Decimal("50.00"),
        status=status,
        due_at=now + due_delta,
        created_at=now,
        updated_at=now,
    )


def make_membership(role):
    return Membership(
        id=uuid4(),
        tontine_id=uuid4(),
        user_id=uuid4(),
        role=role,
        status=MembershipStatus.ACTIVE,
    )


def test_late_is_effective_and_not_persisted():
    item = make_contribution(due_delta=timedelta(seconds=-1))
    assert effective_status(item) == EffectiveContributionStatus.LATE
    assert item.status == ContributionStatus.PENDING
    item.status = ContributionStatus.DECLARED
    assert effective_status(item) == EffectiveContributionStatus.DECLARED


def test_rejection_requires_a_real_reason():
    assert (
        ContributionReject(reason="  Justificatif illisible ").reason
        == "Justificatif illisible"
    )
    with pytest.raises(ValidationError):
        ContributionReject(reason=" ")


def test_financial_and_generation_permissions_are_distinct():
    require_financial_role(make_membership(MembershipRole.TREASURER))
    with pytest.raises(ContributionError):
        require_generation_role(make_membership(MembershipRole.TREASURER))
    with pytest.raises(ContributionError):
        require_financial_role(make_membership(MembershipRole.MEMBER))


def test_large_contribution_summary_uses_all_aggregated_rows(monkeypatch):
    import asyncio
    from unittest.mock import AsyncMock

    from app.modules.contributions import repositories, services

    monkeypatch.setattr(
        repositories,
        "aggregate_cycle",
        AsyncMock(
            return_value=[
                ("late", 10001, Decimal("10001.00")),
                ("confirmed", 1, Decimal("1.00")),
            ]
        ),
    )
    result = asyncio.run(services.summary(AsyncMock(), uuid4()))
    assert result.obligations_total == 10002
    assert result.expected_amount == Decimal("10002.00")
    assert result.late_count == 10001 and result.confirmed_count == 1


def test_openapi_documents_all_contribution_routes():
    schema = TestClient(app).get("/openapi.json").json()
    expected = {
        "/api/v1/tontines/{tontine_id}/cycles/{cycle_id}/contributions/generate": {
            "post"
        },
        "/api/v1/tontines/{tontine_id}/cycles/{cycle_id}/contributions": {"get"},
        "/api/v1/tontines/{tontine_id}/cycles/{cycle_id}/contributions/summary": {
            "get"
        },
        "/api/v1/me/contributions": {"get"},
        "/api/v1/contributions/{contribution_id}": {"get"},
        "/api/v1/contributions/{contribution_id}/declare": {"post"},
        "/api/v1/contributions/{contribution_id}/confirm": {"post"},
        "/api/v1/contributions/{contribution_id}/reject": {"post"},
    }
    for path, methods in expected.items():
        assert methods <= schema["paths"][path].keys()
        for method in methods:
            assert schema["paths"][path][method]["security"] == [{"Auth0Bearer": []}]
