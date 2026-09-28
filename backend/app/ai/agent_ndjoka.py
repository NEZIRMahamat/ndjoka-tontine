"""Agent principal Ndjoka AI.

L'agent s'appuie sur les données réelles de l'utilisateur (via les
outils de ``app.ai.tools``) pour répondre à ses questions sur ses
tontines, cotisations et versements. Les échanges avec le fournisseur
de modèle et l'appel d'outils sont un détail d'implémentation : seule la
réponse finale, en langage naturel, est renvoyée à l'appelant, accompagnée
des éventuelles tontines recommandées afin que l'interface puisse les
afficher sous forme de cartes.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path

from groq import AsyncGroq
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.tools import TOOLS_DEFINITIONS, execute_tool
from app.core.config import get_ai_settings
from app.modules.users.models import User

_PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
_MAX_TOOL_ROUNDS = 4
# Les modèles à raisonnement acceptent un niveau d'effort : « low » réduit la
# latence sans dégrader les réponses factuelles fondées sur les outils.
_REASONING_HINT = {"reasoning_effort": "low"}


def _load_prompt(filename: str) -> str:
    return (_PROMPTS_DIR / filename).read_text(encoding="utf-8")


AGENT_PROMPT = _load_prompt("prompt_system_agent_ndjoka.txt")

_client: AsyncGroq | None = None


def _get_client() -> AsyncGroq:
    global _client
    if _client is None:
        _client = AsyncGroq(api_key=get_ai_settings().groq_api_key.get_secret_value())
    return _client


class AgentError(Exception):
    """Levée lorsque l'agent principal ne peut pas produire de réponse."""


@dataclass
class AgentReply:
    """Réponse finale de l'agent et cartes de recommandation associées."""

    reply: str
    recommendations: list[dict] = field(default_factory=list)


def _context_message(actor: User) -> dict[str, str]:
    name = (actor.display_name or "").strip()
    who = f"L'utilisateur connecté s'appelle {name}." if name else ""
    return {
        "role": "system",
        "content": (
            f"{who} Réponds en français. Les montants sont en euros sauf "
            "indication contraire des outils."
        ).strip(),
    }


def _assistant_turn(message) -> dict:
    """Ne conserver que les champs attendus par le fournisseur."""
    turn: dict = {"role": "assistant", "content": message.content or ""}
    if message.tool_calls:
        turn["tool_calls"] = [
            {
                "id": call.id,
                "type": "function",
                "function": {
                    "name": call.function.name,
                    "arguments": call.function.arguments or "{}",
                },
            }
            for call in message.tool_calls
        ]
    return turn


async def run_ndjoka_agent(
    session: AsyncSession, actor: User, messages: list[dict[str, str]]
) -> AgentReply:
    """Faire dialoguer l'agent avec, au besoin, plusieurs appels d'outils."""
    settings = get_ai_settings()
    conversation: list[dict] = [
        {"role": "system", "content": AGENT_PROMPT},
        _context_message(actor),
        *messages,
    ]
    recommendations: list[dict] = []

    try:
        for _ in range(_MAX_TOOL_ROUNDS):
            response = await _get_client().chat.completions.create(
                model=settings.groq_agent_model,
                messages=conversation,
                tools=TOOLS_DEFINITIONS,
                tool_choice="auto",
                temperature=0.3,
                timeout=45,
                extra_body=_REASONING_HINT,
            )
            response_message = response.choices[0].message
            tool_calls = response_message.tool_calls

            if not tool_calls:
                return AgentReply(response_message.content or "", recommendations)

            conversation.append(_assistant_turn(response_message))
            for tool_call in tool_calls:
                tool_name = tool_call.function.name
                try:
                    tool_args = json.loads(tool_call.function.arguments or "{}")
                except json.JSONDecodeError:
                    tool_args = {}
                if not isinstance(tool_args, dict):
                    tool_args = {}
                result = await execute_tool(session, actor, tool_name, tool_args)
                if result.recommendations:
                    recommendations = result.recommendations
                conversation.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": result.content,
                    }
                )

        final_response = await _get_client().chat.completions.create(
            model=settings.groq_agent_model,
            messages=conversation,
            temperature=0.3,
            timeout=45,
            extra_body=_REASONING_HINT,
        )
        return AgentReply(
            final_response.choices[0].message.content or "", recommendations
        )
    except Exception as error:
        raise AgentError("L'agent Ndjoka AI est momentanément indisponible") from error
