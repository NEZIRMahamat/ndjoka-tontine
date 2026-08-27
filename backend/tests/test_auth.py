from datetime import UTC, datetime, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt import PyJWK
from jwt.algorithms import RSAAlgorithm
from jwt.exceptions import PyJWKClientError
from pydantic import ValidationError

from app.core.auth0 import Auth0TokenValidator, TokenValidationError
from app.core.config import Settings

TEST_DOMAIN = "tenant.example.auth0.com"
TEST_AUDIENCE = "https://api.example.com"
TEST_KEY_ID = "test-key"

type PrivateKey = rsa.RSAPrivateKey


class FakeJwksClient:
    def __init__(self, signing_keys: dict[str, PyJWK]) -> None:
        self._signing_keys = signing_keys

    def get_signing_key_from_jwt(self, token: str) -> PyJWK:
        key_id = jwt.get_unverified_header(token).get("kid")

        if not isinstance(key_id, str) or key_id not in self._signing_keys:
            raise PyJWKClientError("Clé de signature introuvable")

        return self._signing_keys[key_id]


@pytest.fixture(scope="module")
def settings() -> Settings:
    return Settings(
        auth0_domain=TEST_DOMAIN,
        auth0_audience=TEST_AUDIENCE,
    )


@pytest.fixture(scope="module")
def trusted_private_key() -> PrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(scope="module")
def other_private_key() -> PrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def build_jwk(private_key: PrivateKey, key_id: str = TEST_KEY_ID) -> PyJWK:
    jwk = RSAAlgorithm.to_jwk(private_key.public_key(), as_dict=True)
    jwk.update({"alg": "RS256", "kid": key_id, "use": "sig"})
    return PyJWK.from_dict(jwk)


@pytest.fixture(scope="module")
def validator(
    settings: Settings,
    trusted_private_key: PrivateKey,
) -> Auth0TokenValidator:
    jwks_client = FakeJwksClient(
        {TEST_KEY_ID: build_jwk(trusted_private_key)},
    )
    return Auth0TokenValidator(settings, jwks_client=jwks_client)


def create_access_token(
    private_key: PrivateKey,
    settings: Settings,
    *,
    claim_overrides: dict[str, object] | None = None,
    removed_claims: set[str] | None = None,
    key_id: str | None = TEST_KEY_ID,
    algorithm: str = "RS256",
) -> str:
    now = datetime.now(UTC)
    claims: dict[str, object] = {
        "iss": settings.auth0_issuer,
        "sub": "auth0|test-user",
        "aud": settings.auth0_audience,
        "iat": now,
        "exp": now + timedelta(minutes=5),
    }
    claims.update(claim_overrides or {})

    for claim in removed_claims or set():
        claims.pop(claim, None)

    headers = {"kid": key_id} if key_id is not None else None
    signing_key: PrivateKey | str = private_key
    if algorithm == "HS256":
        signing_key = "test-secret-long-enough-for-hs256"

    return jwt.encode(
        claims,
        signing_key,
        algorithm=algorithm,
        headers=headers,
    )


def test_validate_returns_verified_claims(
    validator: Auth0TokenValidator,
    trusted_private_key: PrivateKey,
    settings: Settings,
) -> None:
    token = create_access_token(trusted_private_key, settings)

    claims = validator.validate(token)

    assert claims["sub"] == "auth0|test-user"
    assert claims["aud"] == TEST_AUDIENCE


@pytest.mark.parametrize(
    ("claim_overrides", "removed_claims"),
    [
        ({"aud": "https://wrong-api.example.com"}, None),
        ({"iss": "https://wrong-tenant.example.com/"}, None),
        ({"exp": datetime.now(UTC) - timedelta(minutes=5)}, None),
        (None, {"exp"}),
        (None, {"iat"}),
    ],
    ids=["wrong-audience", "wrong-issuer", "expired", "missing-exp", "missing-iat"],
)
def test_validate_rejects_invalid_claims(
    validator: Auth0TokenValidator,
    trusted_private_key: PrivateKey,
    settings: Settings,
    claim_overrides: dict[str, object] | None,
    removed_claims: set[str] | None,
) -> None:
    token = create_access_token(
        trusted_private_key,
        settings,
        claim_overrides=claim_overrides,
        removed_claims=removed_claims,
    )

    with pytest.raises(TokenValidationError, match="Access Token invalide"):
        validator.validate(token)


def test_validate_rejects_invalid_signature(
    validator: Auth0TokenValidator,
    other_private_key: PrivateKey,
    settings: Settings,
) -> None:
    token = create_access_token(other_private_key, settings)

    with pytest.raises(TokenValidationError, match="Access Token invalide"):
        validator.validate(token)


@pytest.mark.parametrize("key_id", ["unknown-key", None])
def test_validate_rejects_unknown_or_missing_key_id(
    validator: Auth0TokenValidator,
    trusted_private_key: PrivateKey,
    settings: Settings,
    key_id: str | None,
) -> None:
    token = create_access_token(trusted_private_key, settings, key_id=key_id)

    with pytest.raises(TokenValidationError, match="Access Token invalide"):
        validator.validate(token)


def test_validate_rejects_another_algorithm(
    validator: Auth0TokenValidator,
    trusted_private_key: PrivateKey,
    settings: Settings,
) -> None:
    token = create_access_token(
        trusted_private_key,
        settings,
        algorithm="HS256",
    )

    with pytest.raises(TokenValidationError, match="Access Token invalide"):
        validator.validate(token)


@pytest.mark.parametrize("token", ["", "not-a-jwt"])
def test_validate_rejects_empty_or_malformed_token(
    validator: Auth0TokenValidator,
    token: str,
) -> None:
    with pytest.raises(TokenValidationError, match="Access Token invalide"):
        validator.validate(token)


def test_settings_builds_auth0_urls(settings: Settings) -> None:
    assert settings.auth0_issuer == f"https://{TEST_DOMAIN}/"
    assert settings.auth0_jwks_url == f"https://{TEST_DOMAIN}/.well-known/jwks.json"


def test_settings_rejects_domain_with_protocol() -> None:
    with pytest.raises(ValidationError, match="sans protocole"):
        Settings(
            auth0_domain="https://tenant.example.auth0.com",
            auth0_audience=TEST_AUDIENCE,
        )
