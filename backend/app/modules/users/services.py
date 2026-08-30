from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users.models import AUTH0_SUB_MAX_LENGTH, User
from app.modules.users.repositories import (
    find_user_by_auth0_sub,
    insert_user_if_missing,
)


class UserProvisioningError(RuntimeError):
    """La liaison Auth0 n'a produit aucun utilisateur local."""


def validate_auth0_sub(auth0_sub: str) -> None:
    """Refuser un identifiant impossible à conserver sans le transformer."""
    if not auth0_sub or len(auth0_sub) > AUTH0_SUB_MAX_LENGTH:
        raise ValueError("auth0_sub doit contenir entre 1 et 255 caractères")


async def get_or_create_user_by_auth0_sub(
    session: AsyncSession,
    auth0_sub: str,
) -> User:
    """Retourner une seule ligne locale pour l'identité Auth0 validée."""
    validate_auth0_sub(auth0_sub)

    try:
        existing_user = await find_user_by_auth0_sub(session, auth0_sub)
        if existing_user is not None:
            return existing_user

        user = await insert_user_if_missing(session, auth0_sub)
        if user is None:
            user = await find_user_by_auth0_sub(session, auth0_sub)

        if user is None:
            raise UserProvisioningError(
                "L'utilisateur créé concurremment est introuvable"
            )

        await session.commit()
        return user
    except Exception:
        await session.rollback()
        raise
