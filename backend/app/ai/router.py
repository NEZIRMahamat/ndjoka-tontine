"""Routes HTTP pour l'assistant Ndjoka AI.

Un seul point d'entrée conversationnel est exposé au client : la
vérification préalable et l'orchestration multi-étapes restent des
détails d'implémentation invisibles pour l'utilisateur final.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from pydantic_settings import SettingsError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.agent_guardrail import ModerationError, check_moderation
from app.ai.agent_ndjoka import AgentError, run_ndjoka_agent
from app.ai.schemas import ChatRequest, ChatResponse
from app.core.config import get_ai_settings
from app.db.session import get_db_session
from app.modules.users.dependencies import get_current_active_user
from app.modules.users.models import User

router = APIRouter(prefix="/ai", tags=["Ndjoka AI"])
logger = logging.getLogger(__name__)

SessionDep = Annotated[AsyncSession, Depends(get_db_session)]
ActorDep = Annotated[User, Depends(get_current_active_user)]

FALLBACK_REFUSAL = (
    "Je peux vous accompagner sur vos tontines, vos cotisations, vos "
    "versements et l'utilisation de l'application Ndjoka. "
    "Pouvez-vous reformuler votre question dans ce cadre ?"
)
FALLBACK_ERROR = (
    "Ndjoka AI est momentanément indisponible. Merci de réessayer dans un instant."
)


@router.post(
    "/chat",
    response_model=ChatResponse,
    responses={
        401: {"description": "Access Token absent, invalide ou expiré"},
        403: {"description": "Compte suspendu ou désactivé"},
        422: {"description": "Message invalide"},
        503: {"description": "Assistant momentanément indisponible"},
    },
    summary="Converser avec l'assistant Ndjoka AI",
)
async def chat_with_agent(
    payload: ChatRequest, session: SessionDep, actor: ActorDep
) -> ChatResponse:
    try:
        settings = get_ai_settings()
    except (ValidationError, SettingsError) as error:
        logger.error("Configuration Ndjoka AI invalide")
        raise HTTPException(status_code=503, detail=FALLBACK_ERROR) from error

    history = payload.messages[-settings.ai_history_limit :]
    last_user_message = history[-1].content

    try:
        moderation = await check_moderation(last_user_message)
    except ModerationError as error:
        logger.warning("Ndjoka AI indisponible pendant la vérification")
        raise HTTPException(status_code=503, detail=FALLBACK_ERROR) from error

    if not moderation.get("is_allowed", False):
        return ChatResponse(reply=moderation.get("refusal_message") or FALLBACK_REFUSAL)

    try:
        reply = await run_ndjoka_agent(
            session, actor, [message.model_dump() for message in history]
        )
    except AgentError as error:
        logger.warning("Ndjoka AI indisponible pendant la réponse")
        raise HTTPException(status_code=503, detail=FALLBACK_ERROR) from error

    if not reply:
        logger.error("Ndjoka AI a retourné une réponse vide")
        raise HTTPException(status_code=503, detail=FALLBACK_ERROR)
    return ChatResponse(reply=reply)
