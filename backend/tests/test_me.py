from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes import me as me_routes
from app.core.auth0 import (
    TokenValidationError,
    get_current_token_payload,
    get_token_validator,
)
from app.db.session import get_db_session
from app.main import app
from app.modules.users.dependencies import get_current_active_user
from app.modules.users.enums import GlobalRole, UserStatus
from app.modules.users.models import User
from app.schemas.auth import TokenPayload

FRONTEND_ORIGIN = "http://localhost:5173"
LOCAL_USER_ID = UUID("c132a94e-fef9-4f8f-b319-f9b52ae4fddb")
CREATED_AT = datetime(2026, 8, 30, 9, 15, 30, tzinfo=UTC)
UPDATED_AT = datetime(2026, 9, 1, 10, 45, 12, tzinfo=UTC)


class StubTokenValidator:
    def __init__(self, error: TokenValidationError | None = None) -> None:
        self.error = error
        self.received_tokens: list[str] = []

    def validate(self, access_token: str) -> dict[str, object]:
        self.received_tokens.append(access_token)
        if self.error is not None:
            raise self.error
        raise AssertionError("Ce validateur ne sert qu'aux scénarios invalides")


@pytest.fixture
def client() -> Iterator[TestClient]:
    app.dependency_overrides.clear()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def build_token_payload() -> TokenPayload:
    return TokenPayload(
        sub="auth0|test-user",
        iss="https://tenant.example.auth0.com/",
        aud="https://api.example.com",
        exp=4_102_444_800,
        iat=1_700_000_000,
        permissions=["read:tontines"],
        email="test-user@example.com",
    )


def build_user(
    *,
    status: UserStatus = UserStatus.ACTIVE,
    deactivated_at: datetime | None = None,
) -> User:
    return User(
        id=LOCAL_USER_ID,
        auth0_sub="auth0|test-user",
        email="test-user@example.com",
        display_name="Nezir",
        avatar_url="https://cdn.example.com/avatar.png",
        locale="fr-FR",
        timezone="Europe/Paris",
        status=status,
        global_role=GlobalRole.USER,
        created_at=CREATED_AT,
        updated_at=UPDATED_AT,
        deactivated_at=deactivated_at,
    )


def override_authenticated_user(
    user: User,
    session: AsyncSession | None = None,
) -> AsyncSession:
    database_session = session or MagicMock(spec=AsyncSession)

    async def provide_session() -> AsyncIterator[AsyncSession]:
        yield database_session

    app.dependency_overrides[get_current_token_payload] = build_token_payload
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db_session] = provide_session
    return database_session


def test_me_returns_401_without_token(client: TestClient) -> None:
    response = client.get(
        "/api/v1/me",
        headers={"Origin": FRONTEND_ORIGIN},
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.headers["access-control-allow-origin"] == FRONTEND_ORIGIN
    assert response.json() == {"detail": "Authentification requise"}


def test_me_returns_401_with_invalid_token(client: TestClient) -> None:
    validator = StubTokenValidator(TokenValidationError("invalid"))
    app.dependency_overrides[get_token_validator] = lambda: validator

    response = client.get(
        "/api/v1/me",
        headers={
            "Authorization": "Bearer invalid-token",
            "Origin": FRONTEND_ORIGIN,
        },
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json() == {"detail": "Access Token invalide ou expiré"}
    assert validator.received_tokens == ["invalid-token"]


def test_me_returns_complete_ndjoka_profile(client: TestClient) -> None:
    override_authenticated_user(build_user())

    response = client.get(
        "/api/v1/me",
        headers={"Authorization": "Bearer ignored", "Origin": FRONTEND_ORIGIN},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == FRONTEND_ORIGIN
    assert response.json() == {
        "id": str(LOCAL_USER_ID),
        "email": "test-user@example.com",
        "display_name": "Nezir",
        "avatar_url": "https://cdn.example.com/avatar.png",
        "locale": "fr-FR",
        "timezone": "Europe/Paris",
        "status": "active",
        "global_role": "user",
        "created_at": "2026-08-30T09:15:30Z",
        "updated_at": "2026-09-01T10:45:12Z",
        "deactivated_at": None,
        "authenticated": True,
        "sub": "auth0|test-user",
        "permissions": ["read:tontines"],
        "message": "Access Token Auth0 valide",
    }


@pytest.mark.parametrize(
    ("detail", "status_value"),
    [
        ("Compte Ndjoka suspendu", UserStatus.SUSPENDED),
        ("Compte Ndjoka désactivé", UserStatus.DEACTIVATED),
    ],
)
def test_me_returns_403_for_non_active_account(
    client: TestClient,
    detail: str,
    status_value: UserStatus,
) -> None:
    app.dependency_overrides[get_current_token_payload] = build_token_payload

    def reject_non_active_user() -> User:
        raise HTTPException(status_code=403, detail=detail)

    app.dependency_overrides[get_current_active_user] = reject_non_active_user

    response = client.get(
        "/api/v1/me",
        headers={"Authorization": "Bearer ignored"},
    )

    assert status_value in {UserStatus.SUSPENDED, UserStatus.DEACTIVATED}
    assert response.status_code == 403
    assert response.json() == {"detail": detail}
    assert "www-authenticate" not in response.headers


def test_patch_me_updates_only_profile_fields(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = build_user()
    session = override_authenticated_user(user)
    updated_user = build_user()
    updated_user.display_name = "Nouveau nom"
    updated_user.avatar_url = None
    updated_user.timezone = "Africa/Ndjamena"
    update_profile = AsyncMock(return_value=updated_user)
    monkeypatch.setattr(me_routes, "update_user_profile", update_profile)

    response = client.patch(
        "/api/v1/me",
        headers={"Authorization": "Bearer ignored"},
        json={
            "display_name": "  Nouveau nom  ",
            "avatar_url": None,
            "timezone": "Africa/Ndjamena",
        },
    )

    assert response.status_code == 200
    assert response.json()["display_name"] == "Nouveau nom"
    assert response.json()["avatar_url"] is None
    assert response.json()["timezone"] == "Africa/Ndjamena"
    assert response.json()["message"] == "Profil Ndjoka mis à jour"
    update_profile.assert_awaited_once_with(
        session,
        user,
        {
            "display_name": "Nouveau nom",
            "avatar_url": None,
            "timezone": "Africa/Ndjamena",
        },
    )


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"email": "attacker@example.com"},
        {"status": "suspended"},
        {"global_role": "platform_admin"},
        {"auth0_sub": "auth0|attacker"},
        {"timezone": "invalid/timezone"},
    ],
)
def test_patch_me_rejects_empty_invalid_or_protected_payloads(
    client: TestClient,
    payload: dict[str, object],
) -> None:
    override_authenticated_user(build_user())

    response = client.patch(
        "/api/v1/me",
        headers={"Authorization": "Bearer ignored"},
        json=payload,
    )

    assert response.status_code == 422


def test_post_me_deactivate_returns_logically_deactivated_profile(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = build_user()
    session = override_authenticated_user(user)
    deactivated_at = datetime(2026, 9, 1, 11, 0, tzinfo=UTC)
    deactivated_user = build_user(
        status=UserStatus.DEACTIVATED,
        deactivated_at=deactivated_at,
    )
    deactivate = AsyncMock(return_value=deactivated_user)
    monkeypatch.setattr(me_routes, "deactivate_user", deactivate)

    response = client.post(
        "/api/v1/me/deactivate",
        headers={"Authorization": "Bearer ignored"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "deactivated"
    assert response.json()["deactivated_at"] == "2026-09-01T11:00:00Z"
    assert response.json()["message"] == "Compte Ndjoka désactivé"
    deactivate.assert_awaited_once_with(session, user)


@pytest.mark.parametrize("method", ["PATCH", "POST"])
def test_me_cors_preflight_allows_profile_mutations(
    client: TestClient,
    method: str,
) -> None:
    response = client.options(
        "/api/v1/me",
        headers={
            "Origin": FRONTEND_ORIGIN,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": "Authorization, Content-Type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == FRONTEND_ORIGIN
    assert method in response.headers["access-control-allow-methods"]
    allowed_headers = response.headers["access-control-allow-headers"].lower()
    assert "authorization" in allowed_headers
    assert "content-type" in allowed_headers


def test_me_cors_preflight_rejects_unknown_origin(client: TestClient) -> None:
    response = client.options(
        "/api/v1/me",
        headers={
            "Origin": "https://unknown.example.com",
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "Authorization, Content-Type",
        },
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
