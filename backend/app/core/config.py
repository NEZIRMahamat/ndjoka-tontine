import os
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
SUPPORTED_ENVIRONMENTS = {"dev", "prod"}


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
def get_settings() -> Settings:
    """Charger une seule fois la configuration du processus FastAPI."""
    return Settings(
        _env_file=get_environment_file(),
        _env_file_encoding="utf-8",
    )
