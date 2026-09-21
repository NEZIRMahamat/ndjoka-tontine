import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.request_context import request_id_context
from app.main import app
from app.modules.audit import repositories, services
from app.modules.audit.catalog import EVENT_CATALOG
from app.modules.audit.enums import AuditActorType
from app.modules.memberships.enums import MembershipRole
from app.modules.users.enums import GlobalRole


def test_request_id_is_preserved_or_generated() -> None:
    client = TestClient(app)
    supplied = uuid4()

    response = client.get("/api/v1/health", headers={"X-Request-ID": str(supplied)})
    generated = client.get("/api/v1/health", headers={"X-Request-ID": "invalid"})

    assert response.headers["X-Request-ID"] == str(supplied)
    assert UUID(generated.headers["X-Request-ID"])


def test_openapi_exposes_read_only_audit_routes() -> None:
    schema = app.openapi()
    expected = {
        "/api/v1/me/audit-events",
        "/api/v1/me/audit-events/{event_id}",
        "/api/v1/tontines/{tontine_id}/audit-events",
        "/api/v1/tontines/{tontine_id}/audit-events/{event_id}",
        "/api/v1/admin/audit-events",
        "/api/v1/admin/audit-events/{event_id}",
    }

    assert expected <= schema["paths"].keys()
    for path in expected:
        assert set(schema["paths"][path]) == {"get"}
        assert schema["paths"][path]["get"]["security"] == [{"Auth0Bearer": []}]


def test_catalog_contains_expected_sensitive_actions() -> None:
    assert {
        "user.global_role_changed",
        "tontine.archived",
        "invitation.accepted",
        "membership.ownership_transferred",
        "cycle.activated",
        "contribution.confirmed",
        "payout.declared_paid",
        "payout.disputed",
    } <= EVENT_CATALOG.keys()


def test_record_enforces_catalog_and_sensitive_field_allowlist(monkeypatch) -> None:
    session = MagicMock(spec=AsyncSession)
    actor_id, resource_id, request_id = uuid4(), uuid4(), uuid4()
    captured = None

    async def append(_session, event):
        nonlocal captured
        captured = event
        return event

    monkeypatch.setattr(repositories, "append", append)
    token = request_id_context.set(request_id)
    try:
        asyncio.run(
            services.record(
                session,
                event_name="contribution.confirmed",
                actor_user_id=actor_id,
                resource_type="contribution",
                resource_id=resource_id,
                changes={"status": {"from": "declared", "to": "confirmed"}},
            )
        )
    finally:
        request_id_context.reset(token)

    assert captured.actor_type == AuditActorType.USER
    assert captured.request_id == request_id
    assert captured.context == {"source": "api"}

    for changes in (
        {"authorization": {"to": "Bearer secret"}},
        {"status": {"to": "confirmed", "password": "secret"}},
        {"complete_user_object": {"to": {"email": "person@example.com"}}},
    ):
        with pytest.raises(services.AuditError):
            asyncio.run(
                services.record(
                    session,
                    event_name="contribution.confirmed",
                    actor_user_id=actor_id,
                    resource_type="contribution",
                    resource_id=resource_id,
                    changes=changes,
                )
            )


def test_system_event_has_no_actor(monkeypatch) -> None:
    captured = None

    async def append(_session, event):
        nonlocal captured
        captured = event
        return event

    monkeypatch.setattr(repositories, "append", append)
    asyncio.run(
        services.record(
            MagicMock(spec=AsyncSession),
            event_name="payout.cancelled",
            resource_type="payout",
            resource_id=uuid4(),
            changes={"reason": {"to": "cycle_cancelled"}},
            source="system",
        )
    )

    assert captured.actor_type == AuditActorType.SYSTEM
    assert captured.actor_user_id is None
    assert captured.context == {"source": "system"}


def test_cursor_roundtrip_and_validation() -> None:
    item = SimpleNamespace(id=uuid4(), occurred_at=datetime.now(UTC))
    cursor = services.encode_cursor(item)
    occurred_at, event_id = services.decode_cursor(cursor)

    assert event_id == item.id
    assert occurred_at == item.occurred_at
    with pytest.raises(services.AuditError) as error:
        services.decode_cursor("not-a-cursor")
    assert error.value.status_code == 422


@pytest.mark.parametrize(
    ("role", "expected"),
    [
        (MembershipRole.OWNER, "all"),
        (MembershipRole.MANAGER, "all"),
        (MembershipRole.TREASURER, "financial"),
        (MembershipRole.MEMBER, "personal"),
    ],
)
def test_tontine_visibility_by_role(role, expected) -> None:
    membership = SimpleNamespace(role=role)
    actor = SimpleNamespace(global_role=GlobalRole.USER)
    assert services.tontine_visibility(membership, actor) == expected


def test_platform_admin_has_global_tontine_visibility() -> None:
    actor = SimpleNamespace(global_role=GlobalRole.PLATFORM_ADMIN)
    assert services.tontine_visibility(None, actor) == "all"


def test_outsider_cannot_read_tontine_audit() -> None:
    actor = SimpleNamespace(global_role=GlobalRole.USER)
    with pytest.raises(services.AuditError) as error:
        services.tontine_visibility(None, actor)
    assert error.value.status_code == 404
