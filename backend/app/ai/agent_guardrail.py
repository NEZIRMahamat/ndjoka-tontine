"""Contrôle de modération pour Ndjoka AI.

Ce module vérifie, message par message, que la demande de l'utilisateur
relève bien du périmètre de l'application (tontines, épargne, aide à
l'utilisation) avant de la transmettre à l'agent principal. La décision
est toujours renvoyée sous forme de texte naturel côté utilisateur : les
mécanismes internes (modération, appel de modèle, etc.) ne doivent
jamais être mentionnés dans les réponses affichées.
"""

import json
from pathlib import Path

from groq import AsyncGroq

from app.core.config import get_ai_settings

_PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"


def _load_prompt(filename: str) -> str:
    return (_PROMPTS_DIR / filename).read_text(encoding="utf-8")


GUARDRAIL_PROMPT = _load_prompt("prompt_system_guardrail.txt")

_client: AsyncGroq | None = None


def _get_client() -> AsyncGroq:
    global _client
    if _client is None:
        _client = AsyncGroq(api_key=get_ai_settings().groq_api_key.get_secret_value())
    return _client


class ModerationError(Exception):
    """Levée lorsque la vérification préalable ne peut pas aboutir."""


async def check_moderation(user_message: str) -> dict:
    """Décider si le message peut être traité par l'agent principal.

    Renvoie un dict ``{"is_allowed": bool, "refusal_message": str | None}``.
    """
    try:
        response = await _get_client().chat.completions.create(
            model=get_ai_settings().groq_moderator_model,
            messages=[
                {"role": "system", "content": GUARDRAIL_PROMPT},
                {"role": "user", "content": user_message},
            ],
            response_format={"type": "json_object"},
            temperature=0.0,
            timeout=15,
        )
        content = response.choices[0].message.content or "{}"
        decision = json.loads(content)
    except Exception as error:
        raise ModerationError("Le contrôle préalable a échoué") from error

    if not isinstance(decision, dict) or "is_allowed" not in decision:
        raise ModerationError("Réponse de contrôle invalide")
    return decision
