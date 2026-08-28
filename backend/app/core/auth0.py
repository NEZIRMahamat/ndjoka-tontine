from functools import lru_cache
from typing import Annotated, Any, Protocol

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWK, PyJWKClient
from jwt.exceptions import PyJWTError
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.schemas.auth import TokenPayload

AUTH0_ALGORITHMS = ["RS256"]
REQUIRED_CLAIMS = ["iss", "sub", "aud", "exp", "iat"]

type TokenClaims = dict[str, Any]

bearer_scheme = HTTPBearer(
    bearerFormat="JWT",
    scheme_name="Auth0Bearer",
    description="Access Token Auth0 destiné à l'API Ndjoka Tontine",
    auto_error=False,
)


class SigningKeyProvider(Protocol):
    """Contrat minimal permettant d'injecter le fournisseur JWKS en test."""

    def get_signing_key_from_jwt(self, token: str) -> PyJWK: ...


class TokenValidationError(Exception):
    """Le jeton ne peut pas être considéré comme un Access Token Auth0 valide."""


class Auth0TokenValidator:
    """Valider les Access Tokens Auth0 avec les clés publiques du tenant."""

    def __init__(
        self,
        settings: Settings,
        jwks_client: SigningKeyProvider | None = None,
    ) -> None:
        self._settings = settings
        self._jwks_client = jwks_client or PyJWKClient(
            settings.auth0_jwks_url,
            cache_keys=False,
            cache_jwk_set=True,
            lifespan=300,
            timeout=5,
        )

    def validate(self, access_token: str) -> TokenClaims:
        """Vérifier la signature et les claims obligatoires du JWT."""
        if not access_token.strip():
            raise TokenValidationError("Access Token invalide")

        try:
            signing_key = self._jwks_client.get_signing_key_from_jwt(access_token)
            return jwt.decode(
                access_token,
                signing_key,
                algorithms=AUTH0_ALGORITHMS,
                audience=self._settings.auth0_audience,
                issuer=self._settings.auth0_issuer,
                options={
                    "require": REQUIRED_CLAIMS,
                    "enforce_minimum_key_length": True,
                },
            )
        except PyJWTError as error:
            raise TokenValidationError("Access Token invalide") from error


@lru_cache
def get_token_validator() -> Auth0TokenValidator:
    """Conserver le cache JWKS pendant toute la vie du processus."""
    return Auth0TokenValidator(get_settings())


def unauthorized(detail: str) -> HTTPException:
    """Construire une réponse 401 conforme au schéma Bearer."""
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_token_payload(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
    validator: Annotated[Auth0TokenValidator, Depends(get_token_validator)],
) -> TokenPayload:
    """Extraire et valider l'Access Token transmis dans l'en-tête Bearer."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized("Authentification requise")

    try:
        claims = validator.validate(credentials.credentials)
        return TokenPayload.model_validate(claims)
    except (TokenValidationError, ValidationError) as error:
        raise unauthorized("Access Token invalide ou expiré") from error
