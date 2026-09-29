"""Diagnostic de la configuration Ndjoka AI, réservé aux administrateurs.

Sert à comprendre, sur un environnement déployé, pourquoi l'assistant
répond « indisponible » sans avoir à lire la configuration secrète :
la clé n'est jamais renvoyée, seuls ses quatre derniers caractères le sont.
"""

from __future__ import annotations

from pydantic import BaseModel, ValidationError
from pydantic_settings import SettingsError

from app.core.config import get_ai_settings

_MAX_ERROR_LENGTH = 300


class AIDiagnosticRead(BaseModel):
    configured: bool
    agent_model: str | None = None
    moderator_model: str | None = None
    api_key_suffix: str | None = None
    provider_reachable: bool = False
    agent_model_available: bool | None = None
    moderator_model_available: bool | None = None
    available_models: list[str] = []
    error: str | None = None


def describe_failure(error: BaseException) -> str:
    """Résumer une exception et sa cause sans dépasser une ligne de journal."""
    cause = error.__cause__ or error.__context__
    target = cause if cause is not None else error
    message = str(target).replace("\n", " ").strip()
    summary = (
        f"{type(target).__name__}: {message}" if message else type(target).__name__
    )
    return summary[:_MAX_ERROR_LENGTH]


async def run_diagnostic() -> AIDiagnosticRead:
    """Charger la configuration puis interroger le fournisseur."""
    try:
        settings = get_ai_settings()
    except (ValidationError, SettingsError) as error:
        return AIDiagnosticRead(configured=False, error=describe_failure(error))

    key = settings.groq_api_key.get_secret_value()
    report = AIDiagnosticRead(
        configured=True,
        agent_model=settings.groq_agent_model,
        moderator_model=settings.groq_moderator_model,
        api_key_suffix=f"…{key[-4:]}" if len(key) >= 4 else "…",
    )

    from groq import AsyncGroq

    try:
        client = AsyncGroq(api_key=key, timeout=10.0)
        listing = await client.models.list()
    except Exception as error:  # noqa: BLE001 - tout échec doit être rapporté
        report.error = describe_failure(error)
        return report

    models = sorted(model.id for model in listing.data)
    report.provider_reachable = True
    report.available_models = models
    report.agent_model_available = settings.groq_agent_model in models
    report.moderator_model_available = settings.groq_moderator_model in models
    if not report.agent_model_available or not report.moderator_model_available:
        report.error = "Un des modèles configurés n'est pas disponible pour cette clé."
    return report
