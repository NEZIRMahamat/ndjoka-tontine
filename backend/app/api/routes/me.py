from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.auth0 import get_current_token_payload
from app.modules.users.dependencies import get_current_ndjoka_user
from app.modules.users.models import User
from app.schemas.auth import CurrentUserResponse, TokenPayload

router = APIRouter(prefix="/me", tags=["authentication"])


@router.get(
    "",
    response_model=CurrentUserResponse,
    responses={401: {"description": "Access Token absent, invalide ou expiré"}},
    summary="Obtenir l'utilisateur Ndjoka connecté",
)
async def read_current_user(
    token_payload: Annotated[TokenPayload, Depends(get_current_token_payload)],
    current_user: Annotated[User, Depends(get_current_ndjoka_user)],
) -> CurrentUserResponse:
    """Retourner l'identité Auth0 et le profil PostgreSQL du porteur."""
    return CurrentUserResponse(
        authenticated=True,
        id=current_user.id,
        sub=current_user.auth0_sub,
        email=current_user.email,
        status=current_user.status,
        created_at=current_user.created_at,
        updated_at=current_user.updated_at,
        permissions=token_payload.permissions,
        message="Access Token Auth0 valide",
    )
