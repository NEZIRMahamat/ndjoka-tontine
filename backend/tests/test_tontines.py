import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.main import app
from app.modules.memberships.dependencies import get_current_membership
from app.modules.memberships.enums import MembershipRole, MembershipStatus
from app.modules.memberships.models import Membership
from app.modules.tontines import repositories, services
from app.modules.tontines.enums import TontineStatus
from app.modules.tontines.models import Tontine
from app.modules.tontines.schemas import TontineCreate, TontineUpdate
from app.modules.users.dependencies import get_current_ndjoka_user
from app.modules.users.enums import GlobalRole, UserStatus
from app.modules.users.models import User


@pytest.fixture
def actor():
    return User(
        id=uuid4(),
        auth0_sub="auth0|owner",
        status=UserStatus.ACTIVE,
        global_role=GlobalRole.USER,
    )


@pytest.fixture
def tontine(actor):
    now = datetime.now(UTC)
    return Tontine(
        id=uuid4(),
        name="Projet famille",
        description=None,
        currency="EUR",
        max_members=None,
        status=TontineStatus.DRAFT,
        created_by_user_id=actor.id,
        created_at=now,
        updated_at=now,
        archived_at=None,
    )


@pytest.fixture
def owner_membership(actor, tontine):
    return Membership(
        id=uuid4(),
        tontine_id=tontine.id,
        user_id=actor.id,
        role=MembershipRole.OWNER,
        status=MembershipStatus.ACTIVE,
        joined_at=tontine.created_at,
        updated_at=tontine.updated_at,
        ended_at=None,
    )


@pytest.fixture
def session():
    return MagicMock(spec=AsyncSession)


@pytest.fixture
def client(actor, session, owner_membership):
    app.dependency_overrides[get_current_ndjoka_user] = lambda: actor
    app.dependency_overrides[get_db_session] = lambda: session
    app.dependency_overrides[get_current_membership] = lambda: owner_membership
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.mark.parametrize(
    "fields",
    [
        {"name": "ab"},
        {"name": "   "},
        {"name": "x" * 121},
        {"currency": "ZZZ"},
        {"max_members": 1},
        {"max_members": True},
        {"max_members": 2.5},
        {"max_members": 2_147_483_648},
        {"status": "active"},
        {"created_by_user_id": str(uuid4())},
        {"description": "x" * 5001},
        {"id": str(uuid4())},
        {"archived_at": None},
    ],
)
def test_create_rejects_invalid_or_server_fields(fields):
    with pytest.raises(ValidationError):
        TontineCreate.model_validate({"name": "Ma tontine", **fields})


def test_create_normalizes_and_defaults():
    payload = TontineCreate(name="  Famille  ", currency=" xaf ", description="  ")
    assert payload.name == "Famille"
    assert payload.currency == "XAF"
    assert payload.description is None
    assert TontineCreate(name="Famille").currency == "EUR"


@pytest.mark.parametrize(
    "fields",
    [
        {"name": None},
        {"currency": None},
        {"status": "active"},
        {"created_by_user_id": str(uuid4())},
    ],
)
def test_patch_rejects_null_required_or_protected_fields(fields):
    with pytest.raises(ValidationError):
        TontineUpdate.model_validate(fields)


def test_patch_distinguishes_omitted_and_clear():
    assert TontineUpdate(description=None).model_dump(exclude_unset=True) == {
        "description": None
    }


def test_repository_filters_owner_and_locks(session):
    session.scalar.return_value = None
    owner_id, tontine_id = uuid4(), uuid4()
    asyncio.run(
        repositories.find_accessible_tontine(session, tontine_id, owner_id, lock=True)
    )
    statement = session.scalar.call_args.args[0]
    sql = str(statement.compile(dialect=postgresql.dialect()))
    assert "memberships.user_id =" in sql
    assert "memberships.status =" in sql
    assert "FOR UPDATE" in sql
    assert owner_id in statement.compile().params.values()


def test_create_201_and_location(client, session, tontine):
    async def flush():
        new = session.add.call_args.args[0]
        new.id, new.created_at, new.updated_at = (
            tontine.id,
            tontine.created_at,
            tontine.updated_at,
        )

    session.flush.side_effect = flush
    response = client.post("/api/v1/tontines", json={"name": "Famille"})
    assert response.status_code == 201
    assert response.json()["status"] == "draft"
    assert response.json()["created_by_user_id"] == str(tontine.created_by_user_id)
    assert response.headers["location"].endswith(str(tontine.id))


def test_list_personal_page(client, monkeypatch, tontine):
    fetch = AsyncMock(return_value=([tontine], 1))
    monkeypatch.setattr(repositories, "list_accessible_tontines", fetch)
    response = client.get("/api/v1/tontines?limit=1&offset=0&status=draft")
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert len(response.json()["items"]) == 1
    assert fetch.call_args.args[1] == tontine.created_by_user_id


@pytest.mark.parametrize(
    "query", ["limit=0", "limit=101", "offset=-1", "status=deleted"]
)
def test_bad_pagination(client, query):
    assert client.get(f"/api/v1/tontines?{query}").status_code == 422


@pytest.mark.parametrize(
    "method,suffix", [("get", ""), ("patch", ""), ("post", "/archive")]
)
def test_unknown_or_other_owner_is_404(client, session, method, suffix):
    session.scalar.return_value = None
    kwargs = {"json": {"name": "Nouveau"}} if method == "patch" else {}
    assert (
        getattr(client, method)(
            f"/api/v1/tontines/{uuid4()}{suffix}", **kwargs
        ).status_code
        == 404
    )


def test_patch_and_empty_patch(client, session, tontine):
    session.scalar.return_value = tontine
    path = f"/api/v1/tontines/{tontine.id}"
    assert client.patch(path, json={}).status_code == 400
    response = client.patch(path, json={"name": "Nouveau nom", "max_members": 5})
    assert response.status_code == 200
    assert response.json()["name"] == "Nouveau nom"
    assert response.json()["max_members"] == 5


def test_archive_read_only_and_idempotent(client, session, tontine):
    session.scalar.return_value = tontine
    path = f"/api/v1/tontines/{tontine.id}"
    first = client.post(path + "/archive")
    assert first.status_code == 200
    assert first.json()["status"] == "archived"
    assert first.json()["archived_at"] is not None
    assert (
        client.post(path + "/archive").json()["archived_at"]
        == first.json()["archived_at"]
    )
    assert client.patch(path, json={"name": "Interdit"}).status_code == 409
    assert client.get(path).status_code == 200


def test_currency_frozen_when_active(client, session, tontine):
    tontine.status = TontineStatus.ACTIVE
    session.scalar.return_value = tontine
    path = f"/api/v1/tontines/{tontine.id}"
    assert client.patch(path, json={"currency": "USD"}).status_code == 409
    assert (
        client.patch(path, json={"currency": "EUR", "name": "Autorisé"}).status_code
        == 200
    )


@pytest.mark.parametrize("status", [UserStatus.SUSPENDED, UserStatus.DEACTIVATED])
def test_all_routes_forbid_inactive(client, actor, status):
    actor.status = status
    path = f"/api/v1/tontines/{uuid4()}"
    assert client.get("/api/v1/tontines").status_code == 403
    assert client.post("/api/v1/tontines", json={"name": "Famille"}).status_code == 403
    assert client.get(path).status_code == 403
    assert client.patch(path, json={"name": "Famille"}).status_code == 403
    assert client.post(path + "/archive").status_code == 403


def test_all_routes_require_token(client):
    app.dependency_overrides.pop(get_current_ndjoka_user)
    path = f"/api/v1/tontines/{uuid4()}"
    for method, url, body in [
        ("get", "/api/v1/tontines", None),
        ("post", "/api/v1/tontines", {"name": "Famille"}),
        ("get", path, None),
        ("patch", path, {"name": "Famille"}),
        ("post", path + "/archive", None),
    ]:
        response = client.request(method, url, json=body)
        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"


def test_openapi_documents_all_tontine_operations(client):
    schema = client.get("/openapi.json").json()
    assert schema["info"]["version"] == "0.4.0"
    expected_operations = {
        "/api/v1/tontines": {"get", "post"},
        "/api/v1/tontines/{tontine_id}": {"get", "patch"},
        "/api/v1/tontines/{tontine_id}/archive": {"post"},
    }
    for path, methods in expected_operations.items():
        assert methods <= schema["paths"][path].keys()
        for method in methods:
            assert schema["paths"][path][method]["security"] == [{"Auth0Bearer": []}]


def test_create_rollback_on_database_error(actor, session):
    session.flush.side_effect = RuntimeError("database unavailable")
    with pytest.raises(RuntimeError):
        asyncio.run(
            services.create_tontine(session, actor, TontineCreate(name="Famille"))
        )
    session.rollback.assert_awaited_once()
    session.commit.assert_not_awaited()
