"""Services du profil d'épargnant.

Le statut actif du porteur est déjà garanti par ``get_current_active_user`` ;
ces services se concentrent donc sur la persistance du profil.
"""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.profiles import repositories
from app.modules.profiles.models import SaverProfile
from app.modules.profiles.schemas import SaverProfileInput
from app.modules.users.models import User


async def get_profile(session: AsyncSession, actor: User) -> SaverProfile | None:
    return await repositories.find_profile(session, actor.id)


async def save_profile(
    session: AsyncSession, actor: User, payload: SaverProfileInput
) -> SaverProfile:
    try:
        profile = await repositories.upsert_profile(
            session, actor.id, payload.model_dump()
        )
        await session.commit()
        await session.refresh(profile)
        return profile
    except Exception:
        await session.rollback()
        raise


async def remove_profile(session: AsyncSession, actor: User) -> bool:
    try:
        deleted = await repositories.delete_profile(session, actor.id)
        await session.commit()
        return deleted
    except Exception:
        await session.rollback()
        raise


async def find_profile_for_user(
    session: AsyncSession, user_id: UUID
) -> SaverProfile | None:
    return await repositories.find_profile(session, user_id)
