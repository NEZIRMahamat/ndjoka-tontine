from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users.enums import GlobalRole, UserStatus
from app.modules.users.models import AUTH0_SUB_MAX_LENGTH, User
from app.modules.users.repositories import (
    count_users,
    find_user_by_auth0_sub,
    find_user_by_id,
    insert_user_if_missing,
    list_users,
)

EDITABLE_PROFILE_FIELDS = frozenset(
    {"display_name", "avatar_url", "locale", "timezone"}
)


class UserProvisioningError(RuntimeError):
    """La liaison Auth0 n'a produit aucun utilisateur local."""


class UserNotFoundError(LookupError):
    """L'identifiant interne ne correspond à aucun utilisateur Ndjoka."""


class SelfAdministrationForbiddenError(ValueError):
    """Un administrateur ne peut pas modifier son propre rôle ou statut."""


class UserAdministrationForbiddenError(PermissionError):
    """L'acteur local ne possède pas les droits d'administration requis."""


def validate_auth0_sub(auth0_sub: str) -> None:
    """Refuser un identifiant impossible à conserver sans le transformer."""
    if not auth0_sub or len(auth0_sub) > AUTH0_SUB_MAX_LENGTH:
        raise ValueError("auth0_sub doit contenir entre 1 et 255 caractères")


def validate_auth0_email(email: str | None) -> None:
    """Valider la taille du claim signé sans prétendre vérifier la boîte mail."""
    if email is not None and (not email or len(email) > 255):
        raise ValueError("email Auth0 doit contenir entre 1 et 255 caractères")


async def get_or_create_user_by_auth0_sub(
    session: AsyncSession,
    auth0_sub: str,
    email: str | None = None,
) -> User:
    """Provisionner l'identité Auth0 et synchroniser son e-mail signé éventuel."""
    validate_auth0_sub(auth0_sub)
    validate_auth0_email(email)

    try:
        existing_user = await find_user_by_auth0_sub(session, auth0_sub)
        if existing_user is not None:
            if email is not None and existing_user.email != email:
                existing_user.email = email
                await session.commit()
                await session.refresh(existing_user)
            return existing_user

        user = await insert_user_if_missing(session, auth0_sub, email)
        if user is None:
            user = await find_user_by_auth0_sub(session, auth0_sub)

            if user is not None and email is not None and user.email != email:
                user.email = email

        if user is None:
            raise UserProvisioningError(
                "L'utilisateur créé concurremment est introuvable"
            )

        await session.commit()
        return user
    except Exception:
        await session.rollback()
        raise


async def update_user_profile(
    session: AsyncSession,
    user: User,
    changes: Mapping[str, Any],
) -> User:
    """Modifier uniquement les propriétés de profil appartenant à l'utilisateur."""
    unknown_fields = set(changes) - EDITABLE_PROFILE_FIELDS
    if unknown_fields:
        unknown = ", ".join(sorted(unknown_fields))
        raise ValueError(f"Champs de profil non modifiables : {unknown}")
    if not changes:
        raise ValueError("Au moins un champ de profil doit être fourni")

    try:
        for field_name, value in changes.items():
            setattr(user, field_name, value)
        await session.commit()
        await session.refresh(user)
        return user
    except Exception:
        await session.rollback()
        raise


async def deactivate_user(
    session: AsyncSession,
    user: User,
) -> User:
    """Désactiver logiquement le compte courant sans supprimer ses données."""
    try:
        user.status = UserStatus.DEACTIVATED
        user.deactivated_at = datetime.now(UTC)
        await session.commit()
        await session.refresh(user)
        return user
    except Exception:
        await session.rollback()
        raise


async def get_user_by_id(
    session: AsyncSession,
    user_id: UUID,
) -> User:
    """Retourner un utilisateur ou signaler une ressource inexistante."""
    user = await find_user_by_id(session, user_id)
    if user is None:
        raise UserNotFoundError("Utilisateur introuvable")
    return user


async def get_users_page(
    session: AsyncSession,
    *,
    limit: int,
    offset: int,
    status: UserStatus | None = None,
    global_role: GlobalRole | None = None,
) -> tuple[list[User], int]:
    """Retourner une page administrative et son total filtré."""
    users = await list_users(
        session,
        limit=limit,
        offset=offset,
        status=status,
        global_role=global_role,
    )
    total = await count_users(
        session,
        status=status,
        global_role=global_role,
    )
    return users, total


def _forbid_self_administration(actor: User, target: User) -> None:
    if actor.id == target.id:
        raise SelfAdministrationForbiddenError(
            "Un administrateur ne peut pas modifier son propre rôle ou statut"
        )


def _require_active_platform_admin(actor: User) -> None:
    if (
        actor.status != UserStatus.ACTIVE
        or actor.global_role != GlobalRole.PLATFORM_ADMIN
    ):
        raise UserAdministrationForbiddenError(
            "Droits d'administration de la plateforme insuffisants"
        )


async def update_user_status(
    session: AsyncSession,
    *,
    actor: User,
    target: User,
    new_status: UserStatus,
) -> User:
    """Changer le statut d'un autre utilisateur en conservant son historique."""
    _require_active_platform_admin(actor)
    _forbid_self_administration(actor, target)
    if target.status == new_status:
        return target

    try:
        target.status = new_status
        if new_status == UserStatus.DEACTIVATED:
            target.deactivated_at = datetime.now(UTC)
        await session.commit()
        await session.refresh(target)
        return target
    except Exception:
        await session.rollback()
        raise


async def update_user_global_role(
    session: AsyncSession,
    *,
    actor: User,
    target: User,
    new_role: GlobalRole,
) -> User:
    """Changer le rôle global d'un autre utilisateur de la plateforme."""
    _require_active_platform_admin(actor)
    _forbid_self_administration(actor, target)
    if target.global_role == new_role:
        return target

    try:
        target.global_role = new_role
        await session.commit()
        await session.refresh(target)
        return target
    except Exception:
        await session.rollback()
        raise
