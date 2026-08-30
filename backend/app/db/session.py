from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_database_settings


def build_async_engine(database_url: str) -> AsyncEngine:
    """Construire le moteur sans ouvrir immédiatement de connexion."""
    return create_async_engine(database_url, pool_pre_ping=True)


def build_session_factory(
    engine: AsyncEngine,
) -> async_sessionmaker[AsyncSession]:
    """Créer la fabrique des sessions isolées par requête."""
    return async_sessionmaker(engine, expire_on_commit=False)


@lru_cache
def get_async_engine() -> AsyncEngine:
    """Créer paresseusement un moteur unique pour le processus."""
    database_url = get_database_settings().database_url.get_secret_value()
    return build_async_engine(database_url)


@lru_cache
def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Partager la fabrique, jamais les sessions qu'elle produit."""
    return build_session_factory(get_async_engine())


async def get_db_session() -> AsyncIterator[AsyncSession]:
    """Fournir une session FastAPI puis garantir sa fermeture."""
    async with get_session_factory()() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
