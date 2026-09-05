from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.users.dependencies import (
    get_current_platform_admin,
    get_current_support_or_admin_user,
)
from app.modules.users.enums import GlobalRole, UserStatus
from app.modules.users.models import User
from app.modules.users.schemas import (
    AdminUserResponse,
    UserListResponse,
    UserRoleUpdate,
    UserStatusUpdate,
)
from app.modules.users.services import (
    SelfAdministrationForbiddenError,
    UserAdministrationForbiddenError,
    UserNotFoundError,
    get_user_by_id,
    get_users_page,
    update_user_global_role,
    update_user_status,
)

router = APIRouter(prefix="/admin/users", tags=["administration"])

AUTH_RESPONSES = {
    401: {"description": "Access Token absent, invalide ou expiré"},
    403: {"description": "Compte ou rôle non autorisé"},
}


def user_not_found() -> HTTPException:
    """Produire une réponse cohérente pour un UUID utilisateur inexistant."""
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Utilisateur introuvable",
    )


def self_administration_forbidden(error: Exception) -> HTTPException:
    """Empêcher un administrateur de contourner la règle du profil personnel."""
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=str(error),
    )


@router.get(
    "",
    response_model=UserListResponse,
    responses=AUTH_RESPONSES,
    summary="Lister les utilisateurs Ndjoka",
)
async def read_users(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[User, Depends(get_current_support_or_admin_user)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    user_status: Annotated[UserStatus | None, Query(alias="status")] = None,
    global_role: GlobalRole | None = None,
) -> UserListResponse:
    """Retourner une page filtrable aux équipes support et administration."""
    users, total = await get_users_page(
        session,
        limit=limit,
        offset=offset,
        status=user_status,
        global_role=global_role,
    )
    return UserListResponse(
        items=[AdminUserResponse.model_validate(user) for user in users],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{user_id}",
    response_model=AdminUserResponse,
    responses={**AUTH_RESPONSES, 404: {"description": "Utilisateur introuvable"}},
    summary="Consulter un utilisateur Ndjoka",
)
async def read_user(
    user_id: UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[User, Depends(get_current_support_or_admin_user)],
) -> AdminUserResponse:
    """Retourner un profil utilisateur complet pour l'assistance."""
    try:
        user = await get_user_by_id(session, user_id)
    except UserNotFoundError as error:
        raise user_not_found() from error
    return AdminUserResponse.model_validate(user)


@router.patch(
    "/{user_id}/status",
    response_model=AdminUserResponse,
    responses={**AUTH_RESPONSES, 404: {"description": "Utilisateur introuvable"}},
    summary="Modifier le statut d'un utilisateur Ndjoka",
)
async def change_user_status(
    user_id: UUID,
    payload: UserStatusUpdate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    current_admin: Annotated[User, Depends(get_current_platform_admin)],
) -> AdminUserResponse:
    """Permettre à un administrateur de suspendre, réactiver ou désactiver."""
    try:
        target = await get_user_by_id(session, user_id)
        updated_user = await update_user_status(
            session,
            actor=current_admin,
            target=target,
            new_status=payload.status,
        )
    except UserNotFoundError as error:
        raise user_not_found() from error
    except (
        SelfAdministrationForbiddenError,
        UserAdministrationForbiddenError,
    ) as error:
        raise self_administration_forbidden(error) from error
    return AdminUserResponse.model_validate(updated_user)


@router.patch(
    "/{user_id}/role",
    response_model=AdminUserResponse,
    responses={**AUTH_RESPONSES, 404: {"description": "Utilisateur introuvable"}},
    summary="Modifier le rôle global d'un utilisateur Ndjoka",
)
async def change_user_role(
    user_id: UUID,
    payload: UserRoleUpdate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    current_admin: Annotated[User, Depends(get_current_platform_admin)],
) -> AdminUserResponse:
    """Modifier un rôle global sans créer de permissions génériques."""
    try:
        target = await get_user_by_id(session, user_id)
        updated_user = await update_user_global_role(
            session,
            actor=current_admin,
            target=target,
            new_role=payload.global_role,
        )
    except UserNotFoundError as error:
        raise user_not_found() from error
    except (
        SelfAdministrationForbiddenError,
        UserAdministrationForbiddenError,
    ) as error:
        raise self_administration_forbidden(error) from error
    return AdminUserResponse.model_validate(updated_user)
