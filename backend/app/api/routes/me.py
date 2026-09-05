from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth0 import get_current_token_payload
from app.db.session import get_db_session
from app.modules.users.dependencies import get_current_active_user
from app.modules.users.models import User
from app.modules.users.schemas import CurrentUserResponse, UserProfileUpdate
from app.modules.users.services import deactivate_user, update_user_profile
from app.schemas.auth import TokenPayload

router = APIRouter(prefix="/me", tags=["authentication"])


def build_current_user_response(
    user: User,
    token_payload: TokenPayload,
    *,
    message: str = "Access Token Auth0 valide",
) -> CurrentUserResponse:
    """Projeter le modèle local sans exposer de donnée d'authentification secrète."""
    return CurrentUserResponse(
        authenticated=True,
        id=user.id,
        sub=user.auth0_sub,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        locale=user.locale,
        timezone=user.timezone,
        status=user.status,
        global_role=user.global_role,
        created_at=user.created_at,
        updated_at=user.updated_at,
        deactivated_at=user.deactivated_at,
        permissions=token_payload.permissions,
        message=message,
    )


@router.get(
    "",
    response_model=CurrentUserResponse,
    responses={
        401: {"description": "Access Token absent, invalide ou expiré"},
        403: {"description": "Compte suspendu ou désactivé"},
    },
    summary="Obtenir l'utilisateur Ndjoka connecté",
)
async def read_current_user(
    token_payload: Annotated[TokenPayload, Depends(get_current_token_payload)],
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> CurrentUserResponse:
    """Retourner l'identité Auth0 et le profil PostgreSQL du porteur."""
    return build_current_user_response(current_user, token_payload)


@router.patch(
    "",
    response_model=CurrentUserResponse,
    responses={
        401: {"description": "Access Token absent, invalide ou expiré"},
        403: {"description": "Compte suspendu ou désactivé"},
        422: {"description": "Profil invalide ou champ non modifiable"},
    },
    summary="Modifier son profil Ndjoka",
)
async def update_current_user(
    payload: UserProfileUpdate,
    token_payload: Annotated[TokenPayload, Depends(get_current_token_payload)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CurrentUserResponse:
    """Modifier uniquement les champs de profil appartenant au porteur."""
    updated_user = await update_user_profile(
        session,
        current_user,
        payload.model_dump(exclude_unset=True),
    )
    return build_current_user_response(
        updated_user,
        token_payload,
        message="Profil Ndjoka mis à jour",
    )


@router.post(
    "/deactivate",
    response_model=CurrentUserResponse,
    responses={
        401: {"description": "Access Token absent, invalide ou expiré"},
        403: {"description": "Compte déjà suspendu ou désactivé"},
    },
    summary="Désactiver son compte Ndjoka",
)
async def deactivate_current_user(
    token_payload: Annotated[TokenPayload, Depends(get_current_token_payload)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CurrentUserResponse:
    """Désactiver logiquement le compte local, sans supprimer le compte Auth0."""
    deactivated_user = await deactivate_user(session, current_user)
    return build_current_user_response(
        deactivated_user,
        token_payload,
        message="Compte Ndjoka désactivé",
    )
