import os
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

BACKEND_ROOT = Path(__file__).resolve().parents[2]
SUPPORTED_ENVIRONMENTS = {"dev", "prod"}
ASYNCPG_SSL_MODES = frozenset(
    {"disable", "allow", "prefer", "require", "verify-ca", "verify-full"}
)


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

        normalized_query = database_url.normalized_query
        ssl_query_keys = [key for key in ("sslmode", "ssl") if key in normalized_query]

        if len(ssl_query_keys) > 1:
            raise ValueError(
                "DATABASE_URL ne doit pas combiner les paramètres sslmode et ssl"
            )

        if ssl_query_keys:
            ssl_query_key = ssl_query_keys[0]
            ssl_values = normalized_query[ssl_query_key]

            if len(ssl_values) != 1:
                raise ValueError(
                    f"DATABASE_URL ne doit contenir qu'un paramètre {ssl_query_key}"
                )

            ssl_mode = ssl_values[0].strip().lower()
            if ssl_mode not in ASYNCPG_SSL_MODES:
                allowed_modes = ", ".join(sorted(ASYNCPG_SSL_MODES))
                raise ValueError(
                    "Le mode SSL de DATABASE_URL doit être l'une des valeurs "
                    f"suivantes : {allowed_modes}"
                )

            database_url = database_url.difference_update_query([ssl_query_key])
            database_url = database_url.update_query_dict(
                {"ssl": ssl_mode},
                append=False,
            )

        return SecretStr(database_url.render_as_string(hide_password=False))


class EmailSettings(BaseSettings):
    """Configuration transactionnelle sans exposer les secrets du fournisseur."""

    model_config = SettingsConfigDict(extra="ignore")

    email_provider: str = "console"
    email_from_name: str = "Ndjoka Tontine"
    email_from_address: str = "notifications@ndjoka-tontine.com"
    email_contact_address: str = "contact@ndjoka-tontine.com"
    email_reply_to: str = ""
    frontend_base_url: str = "http://localhost:5173"
    resend_api_key: SecretStr = SecretStr("")
    resend_webhook_secret: SecretStr = SecretStr("")

    @field_validator("email_provider")
    @classmethod
    def validate_provider(cls, value: str) -> str:
        provider = value.strip().lower()
        if provider not in {"console", "resend"}:
            raise ValueError("EMAIL_PROVIDER doit valoir console ou resend")
        return provider

    @field_validator("email_from_name", "email_from_address", "email_contact_address")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Le nom et l'adresse d'expédition sont obligatoires")
        return value.strip()

    @field_validator("frontend_base_url")
    @classmethod
    def validate_frontend_url(cls, value: str) -> str:
        parsed = urlsplit(value.strip())
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("FRONTEND_BASE_URL doit être une URL HTTP(S)")
        return f"{parsed.scheme}://{parsed.netloc}{parsed.path.rstrip('/')}"

    @model_validator(mode="after")
    def validate_resend_key(self):
        if (
            self.email_provider == "resend"
            and not self.resend_api_key.get_secret_value()
        ):
            raise ValueError(
                "RESEND_API_KEY est obligatoire avec EMAIL_PROVIDER=resend"
            )
        return self


class AISettings(BaseSettings):
    """Configuration de l'assistant Ndjoka AI (fournisseur Groq)."""

    model_config = SettingsConfigDict(extra="ignore")

    groq_api_key: SecretStr
    groq_agent_model: str = "llama-3.3-70b-versatile"
    groq_moderator_model: str = "llama-3.1-8b-instant"
    ai_history_limit: int = 16

    @field_validator("groq_api_key")
    @classmethod
    def validate_groq_api_key(cls, value: SecretStr) -> SecretStr:
        if not value.get_secret_value().strip():
            raise ValueError("GROQ_API_KEY ne peut pas être vide")
        return value

    @field_validator("groq_agent_model", "groq_moderator_model")
    @classmethod
    def validate_model_name(cls, value: str) -> str:
        model = value.strip()
        if not model:
            raise ValueError("Les modèles Groq ne peuvent pas être vides")
        return model

    @field_validator("ai_history_limit")
    @classmethod
    def validate_history_limit(cls, value: int) -> int:
        if value < 2:
            raise ValueError("AI_HISTORY_LIMIT doit être supérieur ou égal à 2")
        return value


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
def get_email_settings() -> EmailSettings:
    return EmailSettings(
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


@lru_cache
def get_ai_settings() -> AISettings:
    """Charger la configuration Ndjoka AI, requise uniquement par ses routes."""
    return AISettings(
        _env_file=get_environment_file(),
        _env_file_encoding="utf-8",
    )
