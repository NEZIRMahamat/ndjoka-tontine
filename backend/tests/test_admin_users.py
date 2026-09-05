from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes import admin_users as admin_routes
from app.db.session import get_db_session
from app.main import app
from app.modules.users.dependencies import (
    get_current_platform_admin,
    get_current_support_or_admin_user,
)
from app.modules.users.enums import GlobalRole, UserStatus
from app.modules.users.models import User
from app.modules.users.services import (
    SelfAdministrationForbiddenError,
    UserNotFoundError,
)

ADMIN_ID = UUID("8be34ed0-aad7-4c44-961f-b1dd12174cbc")
TARGET_ID = UUID("fe871bbd-5c8f-44ba-b543-44aad35af599")
NOW = datetime(2026, 9, 1, 12, 0, tzinfo=UTC)


@pytest.fixture
def client() -> Iterator[TestClient]:
    app.dependency_overrides.clear()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def build_user(
    *,
    user_id: UUID = TARGET_ID,
    auth0_sub: str = "auth0|target",
    global_role: GlobalRole = GlobalRole.USER,
    status: UserStatus = UserStatus.ACTIVE,
) -> User:
    return User(
        id=user_id,
        auth0_sub=auth0_sub,
        email="user@example.com",
        display_name="Utilisateur",
        avatar_url=None,
        locale="fr",
        timezone="Europe/Paris",
        status=status,
        global_role=global_role,
        created_at=NOW,
        updated_at=NOW,
        deactivated_at=None,
    )


def override_database_session() -> AsyncSession:
    session = MagicMock(spec=AsyncSession)

    async def provide_session() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_db_session] = provide_session
    return session


def override_read_role(role: GlobalRole = GlobalRole.SUPPORT) -> User:
    user = build_user(
        user_id=ADMIN_ID,
        auth0_sub="auth0|staff",
        global_role=role,
    )
    app.dependency_overrides[get_current_support_or_admin_user] = lambda: user
    return user


def override_platform_admin() -> User:
    admin = build_user(
        user_id=ADMIN_ID,
        auth0_sub="auth0|admin",
        global_role=GlobalRole.PLATFORM_ADMIN,
    )
    app.dependency_overrides[get_current_platform_admin] = lambda: admin
    return admin


def test_admin_list_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/v1/admin/users")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_regular_user_cannot_list_users(client: TestClient) -> None:
    override_database_session()

    def reject_regular_user() -> User:
        raise HTTPException(status_code=403, detail="Droits insuffisants")

    app.dependency_overrides[get_current_support_or_admin_user] = reject_regular_user

    response = client.get(
        "/api/v1/admin/users",
        headers={"Authorization": "Bearer ignored"},
    )

    assert response.status_code == 403


@pytest.mark.parametrize(
    "staff_role",
    [GlobalRole.SUPPORT, GlobalRole.PLATFORM_ADMIN],
)
def test_support_and_admin_can_list_filtered_users(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    staff_role: GlobalRole,
) -> None:
    session = override_database_session()
    override_read_role(staff_role)
    target = build_user(status=UserStatus.SUSPENDED)
    get_page = AsyncMock(return_value=([target], 1))
    monkeypatch.setattr(admin_routes, "get_users_page", get_page)

    response = client.get(
        "/api/v1/admin/users",
        params={
            "limit": 25,
            "offset": 50,
            "status": "suspended",
            "global_role": "user",
        },
        headers={"Authorization": "Bearer ignored"},
    )

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["limit"] == 25
    assert response.json()["offset"] == 50
    assert response.json()["items"][0]["auth0_sub"] == "auth0|target"
    get_page.assert_awaited_once_with(
        session,
        limit=25,
        offset=50,
        status=UserStatus.SUSPENDED,
        global_role=GlobalRole.USER,
    )


@pytest.mark.parametrize(
    "query",
    [
        {"limit": 0},
        {"limit": 101},
        {"offset": -1},
        {"status": "closed"},
        {"global_role": "admin"},
    ],
)
def test_admin_list_rejects_invalid_pagination_or_filters(
    client: TestClient,
    query: dict[str, object],
) -> None:
    override_database_session()
    override_read_role()

    response = client.get("/api/v1/admin/users", params=query)

    assert response.status_code == 422


def test_support_can_read_user_detail(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = override_database_session()
    override_read_role()
    target = build_user()
    get_user = AsyncMock(return_value=target)
    monkeypatch.setattr(admin_routes, "get_user_by_id", get_user)

    response = client.get(f"/api/v1/admin/users/{TARGET_ID}")

    assert response.status_code == 200
    assert response.json()["id"] == str(TARGET_ID)
    assert response.json()["global_role"] == "user"
    get_user.assert_awaited_once_with(session, TARGET_ID)


def test_admin_detail_returns_404_for_unknown_user(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    override_database_session()
    override_read_role(GlobalRole.PLATFORM_ADMIN)
    monkeypatch.setattr(
        admin_routes,
        "get_user_by_id",
        AsyncMock(side_effect=UserNotFoundError("missing")),
    )

    response = client.get(f"/api/v1/admin/users/{TARGET_ID}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Utilisateur introuvable"}


def test_invalid_user_uuid_returns_422(client: TestClient) -> None:
    override_database_session()
    override_read_role()

    response = client.get("/api/v1/admin/users/not-a-uuid")

    assert response.status_code == 422


def test_platform_admin_can_change_another_users_status(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = override_database_session()
    admin = override_platform_admin()
    target = build_user()
    get_user = AsyncMock(return_value=target)

    async def update_status(
        received_session: AsyncSession,
        *,
        actor: User,
        target: User,
        new_status: UserStatus,
    ) -> User:
        assert received_session is session
        assert actor is admin
        assert new_status == UserStatus.SUSPENDED
        target.status = new_status
        return target

    monkeypatch.setattr(admin_routes, "get_user_by_id", get_user)
    monkeypatch.setattr(admin_routes, "update_user_status", update_status)

    response = client.patch(
        f"/api/v1/admin/users/{TARGET_ID}/status",
        json={"status": "suspended"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "suspended"


def test_platform_admin_can_change_another_users_role(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = override_database_session()
    admin = override_platform_admin()
    target = build_user()
    monkeypatch.setattr(
        admin_routes,
        "get_user_by_id",
        AsyncMock(return_value=target),
    )

    async def update_role(
        received_session: AsyncSession,
        *,
        actor: User,
        target: User,
        new_role: GlobalRole,
    ) -> User:
        assert received_session is session
        assert actor is admin
        assert new_role == GlobalRole.SUPPORT
        target.global_role = new_role
        return target

    monkeypatch.setattr(admin_routes, "update_user_global_role", update_role)

    response = client.patch(
        f"/api/v1/admin/users/{TARGET_ID}/role",
        json={"global_role": "support"},
    )

    assert response.status_code == 200
    assert response.json()["global_role"] == "support"


@pytest.mark.parametrize(
    ("path_suffix", "payload"),
    [
        ("status", {"status": "closed"}),
        ("status", {"status": "active", "global_role": "user"}),
        ("role", {"global_role": "admin"}),
        ("role", {"global_role": "support", "status": "active"}),
    ],
)
def test_admin_mutations_reject_invalid_or_extra_fields(
    client: TestClient,
    path_suffix: str,
    payload: dict[str, str],
) -> None:
    override_database_session()
    override_platform_admin()

    response = client.patch(
        f"/api/v1/admin/users/{TARGET_ID}/{path_suffix}",
        json=payload,
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("path_suffix", "payload"),
    [
        ("status", {"status": "suspended"}),
        ("role", {"global_role": "support"}),
    ],
)
def test_admin_mutations_return_404_for_unknown_target(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    path_suffix: str,
    payload: dict[str, str],
) -> None:
    override_database_session()
    override_platform_admin()
    monkeypatch.setattr(
        admin_routes,
        "get_user_by_id",
        AsyncMock(side_effect=UserNotFoundError("missing")),
    )

    response = client.patch(
        f"/api/v1/admin/users/{TARGET_ID}/{path_suffix}",
        json=payload,
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Utilisateur introuvable"}


@pytest.mark.parametrize("path_suffix", ["status", "role"])
def test_support_cannot_mutate_users(
    client: TestClient,
    path_suffix: str,
) -> None:
    override_database_session()

    def reject_support() -> User:
        raise HTTPException(status_code=403, detail="Droits insuffisants")

    app.dependency_overrides[get_current_platform_admin] = reject_support
    payload = (
        {"status": "suspended"}
        if path_suffix == "status"
        else {"global_role": "support"}
    )

    response = client.patch(
        f"/api/v1/admin/users/{TARGET_ID}/{path_suffix}",
        json=payload,
    )

    assert response.status_code == 403


@pytest.mark.parametrize("path_suffix", ["status", "role"])
def test_admin_cannot_modify_own_status_or_role(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    path_suffix: str,
) -> None:
    override_database_session()
    admin = override_platform_admin()
    monkeypatch.setattr(
        admin_routes,
        "get_user_by_id",
        AsyncMock(return_value=admin),
    )
    error = SelfAdministrationForbiddenError("auto-modification interdite")
    if path_suffix == "status":
        monkeypatch.setattr(
            admin_routes,
            "update_user_status",
            AsyncMock(side_effect=error),
        )
        payload = {"status": "suspended"}
    else:
        monkeypatch.setattr(
            admin_routes,
            "update_user_global_role",
            AsyncMock(side_effect=error),
        )
        payload = {"global_role": "user"}

    response = client.patch(
        f"/api/v1/admin/users/{ADMIN_ID}/{path_suffix}",
        json=payload,
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "auto-modification interdite"}
