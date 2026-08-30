import os
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

BACKEND_ROOT = Path(__file__).resolve().parents[2]
SUPPORTED_ENVIRONMENTS = {"dev", "prod"}


class CorsSettings(BaseSettings):
    """Origines autorisées à appeler l'API depuis un navigateur."""

    model_config = SettingsConfigDict(extra="ignore")

    cors_allowed_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173"],
    )

    @field_validator("cors_allowed_origins")
    @classmethod
    def validate_cors_allowed_origins(cls, values: list[str]) -> list[str]:
        origins: list[str] = []

        for value in values:
            origin = value.strip()
            parsed = urlsplit(origin)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.netloc
                or parsed.path not in {"", "/"}
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError(
                    "Chaque origine CORS doit contenir uniquement un schéma HTTP(S) "
                    "et un hôte"
                )

            normalized_origin = f"{parsed.scheme}://{parsed.netloc}"
            if normalized_origin not in origins:
                origins.append(normalized_origin)

        if not origins:
            raise ValueError("CORS_ALLOWED_ORIGINS doit contenir au moins une origine")

        return origins


class DatabaseSettings(BaseSettings):
    """Configuration de la connexion PostgreSQL asynchrone."""

    model_config = SettingsConfigDict(extra="ignore")

    database_url: SecretStr

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: SecretStr) -> SecretStr:
        """Valider PostgreSQL et sélectionner explicitement le pilote asyncpg."""
        raw_url = value.get_secret_value().strip()

        if not raw_url:
            raise ValueError("DATABASE_URL ne peut pas être vide")

        try:
            database_url = make_url(raw_url)
        except ArgumentError as error:
            raise ValueError(
                "DATABASE_URL doit être une URL SQLAlchemy valide"
            ) from error

        if database_url.drivername in {"postgres", "postgresql"}:
            database_url = database_url.set(drivername="postgresql+asyncpg")
        elif database_url.drivername != "postgresql+asyncpg":
            raise ValueError(
                "DATABASE_URL doit utiliser PostgreSQL avec le pilote asyncpg"
            )

        if not database_url.host or not database_url.database:
            raise ValueError("DATABASE_URL doit contenir un hôte et une base")

        return SecretStr(database_url.render_as_string(hide_password=False))


class Settings(BaseSettings):
    """Configuration du backend fournie par l'environnement d'exécution."""

    model_config = SettingsConfigDict(extra="ignore")

    auth0_domain: str
    auth0_audience: str

    @field_validator("auth0_domain")
    @classmethod
    def validate_auth0_domain(cls, value: str) -> str:
        domain = value.strip()

        if not domain:
            raise ValueError("AUTH0_DOMAIN ne peut pas être vide")
        if "://" in domain or "/" in domain:
            raise ValueError(
                "AUTH0_DOMAIN doit être un nom de domaine sans protocole ni chemin"
            )

        return domain

    @field_validator("auth0_audience")
    @classmethod
    def validate_auth0_audience(cls, value: str) -> str:
        audience = value.strip()

        if not audience:
            raise ValueError("AUTH0_AUDIENCE ne peut pas être vide")

        return audience

    @property
    def auth0_issuer(self) -> str:
        return f"https://{self.auth0_domain}/"

    @property
    def auth0_jwks_url(self) -> str:
        return f"{self.auth0_issuer}.well-known/jwks.json"


def get_environment_file() -> Path:
    """Sélectionner le fichier local sans remplacer les variables système."""
    environment = os.getenv("APP_ENV", "dev").strip().lower()

    if environment not in SUPPORTED_ENVIRONMENTS:
        supported = ", ".join(sorted(SUPPORTED_ENVIRONMENTS))
        raise RuntimeError(
            f"APP_ENV doit être l'une des valeurs suivantes : {supported}"
        )

    return BACKEND_ROOT / f".env.{environment}"


@lru_cache
def get_cors_settings() -> CorsSettings:
    """Charger la configuration CORS sans exiger les paramètres Auth0."""
    return CorsSettings(
        _env_file=get_environment_file(),
        _env_file_encoding="utf-8",
    )


@lru_cache
def get_database_settings() -> DatabaseSettings:
    """Charger la configuration PostgreSQL uniquement lorsqu'elle est requise."""
    return DatabaseSettings(
        _env_file=get_environment_file(),
        _env_file_encoding="utf-8",
    )


@lru_cache
def get_settings() -> Settings:
    """Charger une seule fois la configuration du processus FastAPI."""
    return Settings(
        _env_file=get_environment_file(),
        _env_file_encoding="utf-8",
    )
