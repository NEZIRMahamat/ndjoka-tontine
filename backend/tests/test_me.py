from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth0 import TokenValidationError, get_token_validator
from app.db.session import get_db_session
from app.main import app
from app.modules.users import dependencies as user_dependencies
from app.modules.users.models import USER_STATUS_ACTIVE, User

FRONTEND_ORIGIN = "http://localhost:5173"
LOCAL_USER_ID = UUID("c132a94e-fef9-4f8f-b319-f9b52ae4fddb")
LOCAL_USER_CREATED_AT = datetime(2026, 8, 30, 9, 15, 30, tzinfo=UTC)
LOCAL_USER_UPDATED_AT = datetime(2026, 8, 31, 10, 45, 12, tzinfo=UTC)


class StubTokenValidator:
    """Remplacer Auth0 sans contourner la dépendance HTTP Bearer."""

    def __init__(
        self,
        *,
        claims: dict[str, object] | None = None,
        error: TokenValidationError | None = None,
    ) -> None:
        self._claims = claims
        self._error = error
        self.received_tokens: list[str] = []

    def validate(self, access_token: str) -> dict[str, object]:
        self.received_tokens.append(access_token)

        if self._error is not None:
            raise self._error
        if self._claims is None:
            raise AssertionError("Le faux validateur doit recevoir des claims")

        return self._claims


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def override_token_validator(
    monkeypatch: pytest.MonkeyPatch,
    validator: StubTokenValidator,
) -> None:
    monkeypatch.setitem(
        app.dependency_overrides,
        get_token_validator,
        lambda: validator,
    )


def override_database_session(
    monkeypatch: pytest.MonkeyPatch,
    session: AsyncSession,
) -> None:
    async def provide_session() -> AsyncIterator[AsyncSession]:
        yield session

    monkeypatch.setitem(
        app.dependency_overrides,
        get_db_session,
        provide_session,
    )


def build_verified_claims(
    permissions: list[str] | None = None,
) -> dict[str, object]:
    claims: dict[str, object] = {
        "sub": "auth0|test-user",
        "iss": "https://tenant.example.auth0.com/",
        "aud": "https://api.example.com",
        "exp": 4_102_444_800,
        "iat": 1_700_000_000,
        "email": "test-user@example.com",
    }
    if permissions is not None:
        claims["permissions"] = permissions

    return claims


def test_me_returns_401_without_token(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    validator = StubTokenValidator(claims=build_verified_claims())
    override_token_validator(monkeypatch, validator)

    response = client.get(
        "/api/v1/me",
        headers={"Origin": FRONTEND_ORIGIN},
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.headers["access-control-allow-origin"] == FRONTEND_ORIGIN
    assert response.json() == {"detail": "Authentification requise"}
    assert validator.received_tokens == []


def test_me_returns_401_with_invalid_token(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    validator = StubTokenValidator(
        error=TokenValidationError("Access Token invalide"),
    )
    override_token_validator(monkeypatch, validator)

    response = client.get(
        "/api/v1/me",
        headers={
            "Authorization": "Bearer invalid-test-token",
            "Origin": FRONTEND_ORIGIN,
        },
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.headers["access-control-allow-origin"] == FRONTEND_ORIGIN
    assert response.json() == {"detail": "Access Token invalide ou expiré"}
    assert validator.received_tokens == ["invalid-test-token"]


@pytest.mark.parametrize(
    ("permissions_claim", "expected_permissions"),
    [
        (["read:tontines", "create:tontines"], ["read:tontines", "create:tontines"]),
        (None, []),
    ],
    ids=["with-permissions", "without-permissions"],
)
def test_me_returns_200_with_verified_identity(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    permissions_claim: list[str] | None,
    expected_permissions: list[str],
) -> None:
    validator = StubTokenValidator(
        claims=build_verified_claims(permissions_claim),
    )
    override_token_validator(monkeypatch, validator)
    session = MagicMock(spec=AsyncSession)
    override_database_session(monkeypatch, session)
    current_user = User(
        id=LOCAL_USER_ID,
        auth0_sub="auth0|test-user",
        email=None,
        status=USER_STATUS_ACTIVE,
        created_at=LOCAL_USER_CREATED_AT,
        updated_at=LOCAL_USER_UPDATED_AT,
    )
    get_or_create_user = AsyncMock(return_value=current_user)
    monkeypatch.setattr(
        user_dependencies,
        "get_or_create_user_by_auth0_sub",
        get_or_create_user,
    )

    response = client.get(
        "/api/v1/me",
        headers={
            "Authorization": "Bearer valid-test-token",
            "Origin": FRONTEND_ORIGIN,
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == FRONTEND_ORIGIN
    assert response.json() == {
        "authenticated": True,
        "id": str(LOCAL_USER_ID),
        "sub": "auth0|test-user",
        "email": None,
        "status": "active",
        "created_at": "2026-08-30T09:15:30Z",
        "updated_at": "2026-08-31T10:45:12Z",
        "permissions": expected_permissions,
        "message": "Access Token Auth0 valide",
    }
    assert validator.received_tokens == ["valid-test-token"]
    get_or_create_user.assert_awaited_once_with(session, "auth0|test-user")


def test_me_cors_preflight_allows_frontend_origin(client: TestClient) -> None:
    response = client.options(
        "/api/v1/me",
        headers={
            "Origin": FRONTEND_ORIGIN,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == FRONTEND_ORIGIN
    assert "GET" in response.headers["access-control-allow-methods"]
    assert "authorization" in response.headers["access-control-allow-headers"].lower()


def test_me_cors_preflight_rejects_unknown_origin(client: TestClient) -> None:
    response = client.options(
        "/api/v1/me",
        headers={
            "Origin": "https://unknown.example.com",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
