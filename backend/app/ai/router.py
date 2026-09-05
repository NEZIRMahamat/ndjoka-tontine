from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict
from app.ai.agent_guardrail import check_moderation
from app.ai.agent_ndjoka import run_ndjoka_agent

# from app.core.auth import get_current_user_id (ton middleware auth existant)

router = APIRouter(prefix="/api/v1/ai", tags=["Ndjoka AI"])

class ChatRequest(BaseModel):
    messages: List[Dict[str, str]]  # Format [{"role": "user", "content": "..."}]

class ChatResponse(BaseModel):
    reply: str

@router.post("/chat", response_model=ChatResponse)
async def chat_with_agent(
    request: ChatRequest,
    # user_id: str = Depends(get_current_user_id) # Récupéré de manière sécurisée via Auth0
):
    user_id = "user_auth0_123"  # À remplacer par ton token décodé
    last_user_message = request.messages[-1]["content"]

    # 1. Étape Modérateur (8B)
    moderation = await check_moderation(last_user_message)
    if not moderation.get("is_allowed", False):
        return ChatResponse(
            reply=moderation.get("refusal_message") or "Je ne peux répondre qu'aux questions relatives à Ndjoka Tontine et vos finances."
        )

    # 2. Étape Agent Principal (70B)
    try:
        reply = await run_ndjoka_agent(request.messages, user_id=user_id)
        return ChatResponse(reply=reply)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Agent: {str(e)}")