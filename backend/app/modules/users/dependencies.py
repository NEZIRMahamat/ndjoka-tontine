from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth0 import get_current_token_payload
from app.db.session import get_db_session
from app.modules.users.enums import GlobalRole, UserStatus
from app.modules.users.models import User
from app.modules.users.services import get_or_create_user_by_auth0_sub
from app.schemas.auth import TokenPayload


async def get_current_ndjoka_user(
    token_payload: Annotated[TokenPayload, Depends(get_current_token_payload)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> User:
    """Relier l'identité Auth0 validée à son utilisateur Ndjoka local."""
    return await get_or_create_user_by_auth0_sub(
        session,
        token_payload.sub,
        token_payload.email,
    )


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_ndjoka_user)],
) -> User:
    """Bloquer les comptes locaux suspendus ou désactivés malgré un JWT valide."""
    if current_user.status == UserStatus.SUSPENDED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte Ndjoka suspendu",
        )
    if current_user.status == UserStatus.DEACTIVATED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte Ndjoka désactivé",
        )
    if current_user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte Ndjoka non actif",
        )
    return current_user


async def get_current_support_or_admin_user(
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> User:
    """Autoriser la consultation globale au support et aux administrateurs."""
    if current_user.global_role not in {
        GlobalRole.SUPPORT,
        GlobalRole.PLATFORM_ADMIN,
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Droits de consultation des utilisateurs insuffisants",
        )
    return current_user


async def get_current_platform_admin(
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> User:
    """Réserver les mutations globales aux administrateurs de la plateforme."""
    if current_user.global_role != GlobalRole.PLATFORM_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Droits d'administration de la plateforme insuffisants",
        )
    return current_user
