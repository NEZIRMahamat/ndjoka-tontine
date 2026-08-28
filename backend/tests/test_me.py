from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.core.auth0 import TokenValidationError, get_token_validator
from app.main import app

FRONTEND_ORIGIN = "http://localhost:5173"


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
        "sub": "auth0|test-user",
        "permissions": expected_permissions,
        "message": "Access Token Auth0 valide",
    }
    assert validator.received_tokens == ["valid-test-token"]


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
