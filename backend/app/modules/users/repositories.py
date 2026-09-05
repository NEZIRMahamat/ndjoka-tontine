from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users.enums import GlobalRole, UserStatus
from app.modules.users.models import (
    DEFAULT_USER_LOCALE,
    DEFAULT_USER_TIMEZONE,
    User,
)

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
    email: str | None = None,
) -> User | None:
    """Créer l'utilisateur ou ne rien faire si une requête concurrente l'a créé."""
    statement = (
        insert(User)
        .values(
            auth0_sub=auth0_sub,
            email=email,
            locale=DEFAULT_USER_LOCALE,
            timezone=DEFAULT_USER_TIMEZONE,
            status=UserStatus.ACTIVE,
            global_role=GlobalRole.USER,
        )
        .on_conflict_do_nothing(constraint=AUTH0_SUB_UNIQUE_CONSTRAINT)
        .returning(User)
    )
    return await session.scalar(statement)


async def find_user_by_id(
    session: AsyncSession,
    user_id: UUID,
) -> User | None:
    """Rechercher un utilisateur par son identifiant interne Ndjoka."""
    statement = select(User).where(User.id == user_id)
    return await session.scalar(statement)


def _apply_user_filters(
    statement: object,
    *,
    status: UserStatus | None,
    global_role: GlobalRole | None,
) -> object:
    """Appliquer les filtres administratifs partagés par liste et comptage."""
    if status is not None:
        statement = statement.where(User.status == status)
    if global_role is not None:
        statement = statement.where(User.global_role == global_role)
    return statement


async def list_users(
    session: AsyncSession,
    *,
    limit: int,
    offset: int,
    status: UserStatus | None = None,
    global_role: GlobalRole | None = None,
) -> list[User]:
    """Lister les utilisateurs avec une pagination et un ordre stables."""
    statement = select(User)
    statement = _apply_user_filters(
        statement,
        status=status,
        global_role=global_role,
    )
    statement = statement.order_by(User.created_at, User.id).offset(offset).limit(limit)
    result = await session.scalars(statement)
    return list(result.all())


async def count_users(
    session: AsyncSession,
    *,
    status: UserStatus | None = None,
    global_role: GlobalRole | None = None,
) -> int:
    """Compter les utilisateurs correspondant aux filtres administratifs."""
    statement = select(func.count()).select_from(User)
    statement = _apply_user_filters(
        statement,
        status=status,
        global_role=global_role,
    )
    count = await session.scalar(statement)
    return int(count or 0)
