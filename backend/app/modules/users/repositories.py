from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users.models import USER_STATUS_ACTIVE, User

AUTH0_SUB_UNIQUE_CONSTRAINT = "uq_users_auth0_sub"


async def find_user_by_auth0_sub(
    session: AsyncSession,
    auth0_sub: str,
) -> User | None:
    """Rechercher une identité Auth0 exacte, sans la normaliser."""
    statement = select(User).where(User.auth0_sub == auth0_sub)
    return await session.scalar(statement)


async def insert_user_if_missing(
    session: AsyncSession,
    auth0_sub: str,
) -> User | None:
    """Créer l'utilisateur ou ne rien faire si une requête concurrente l'a créé."""
    statement = (
        insert(User)
        .values(auth0_sub=auth0_sub, status=USER_STATUS_ACTIVE)
        .on_conflict_do_nothing(constraint=AUTH0_SUB_UNIQUE_CONSTRAINT)
        .returning(User)
    )
    return await session.scalar(statement)
