from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.auth0 import get_current_token_payload
from app.schemas.auth import CurrentUserResponse, TokenPayload

router = APIRouter(prefix="/me", tags=["authentication"])


@router.get(
    "",
    response_model=CurrentUserResponse,
    responses={401: {"description": "Access Token absent, invalide ou expiré"}},
    summary="Obtenir l'utilisateur Auth0 connecté",
)
async def read_current_user(
    token_payload: Annotated[TokenPayload, Depends(get_current_token_payload)],
) -> CurrentUserResponse:
    """Retourner l'identité validée contenue dans l'Access Token."""
    return CurrentUserResponse(
        authenticated=True,
        sub=token_payload.sub,
        permissions=token_payload.permissions,
        message="Access Token Auth0 valide",
    )
