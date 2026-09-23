"""Agent principal Ndjoka AI.

L'agent s'appuie sur les données réelles de l'utilisateur (via les
outils de ``app.ai.tools``) pour répondre à ses questions sur ses
tontines, cotisations et versements. Les échanges avec le fournisseur
de modèle (Groq) et l'appel d'outils sont un détail d'implémentation :
seule la réponse finale, en langage naturel, est renvoyée à l'appelant.
"""

import json
from pathlib import Path

from groq import AsyncGroq
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.tools import TOOLS_DEFINITIONS, execute_tool
from app.core.config import get_ai_settings
from app.modules.users.models import User

_PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
_MAX_TOOL_ROUNDS = 3


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


async def run_ndjoka_agent(
    session: AsyncSession, actor: User, messages: list[dict[str, str]]
) -> str:
    """Faire dialoguer l'agent avec, au besoin, plusieurs appels d'outils."""
    settings = get_ai_settings()
    conversation: list[dict] = [
        {"role": "system", "content": AGENT_PROMPT},
        *messages,
    ]

    try:
        for _ in range(_MAX_TOOL_ROUNDS):
            response = await _get_client().chat.completions.create(
                model=settings.groq_agent_model,
                messages=conversation,
                tools=TOOLS_DEFINITIONS,
                tool_choice="auto",
                temperature=0.3,
                timeout=30,
            )
            response_message = response.choices[0].message
            tool_calls = response_message.tool_calls

            if not tool_calls:
                return response_message.content or ""

            conversation.append(response_message.model_dump(exclude_unset=True))
            for tool_call in tool_calls:
                tool_name = tool_call.function.name
                try:
                    tool_args = json.loads(tool_call.function.arguments or "{}")
                except json.JSONDecodeError:
                    tool_args = {}
                tool_result = await execute_tool(session, actor, tool_name, tool_args)
                conversation.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": tool_result,
                    }
                )

        final_response = await _get_client().chat.completions.create(
            model=settings.groq_agent_model,
            messages=conversation,
            temperature=0.3,
            timeout=30,
        )
        return final_response.choices[0].message.content or ""
    except Exception as error:
        raise AgentError("L'agent Ndjoka AI est momentanément indisponible") from error
