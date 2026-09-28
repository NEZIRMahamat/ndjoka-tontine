"""Services du profil d'épargnant.

Le statut actif du porteur est déjà garanti par ``get_current_active_user`` ;
ces services se concentrent donc sur la persistance du profil.
"""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.profiles import repositories
from app.modules.profiles.models import SaverProfile
from app.modules.profiles.schemas import PublicProfileRead, SaverProfileInput
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


async def get_public_profile(
    session: AsyncSession, viewer: User, user_id: UUID
) -> PublicProfileRead | None:
    """Assembler la fiche publique d'un membre (réputation et ancienneté)."""
    from sqlalchemy import func, select

    from app.modules.cycles.enums import CycleStatus
    from app.modules.cycles.models import Cycle
    from app.modules.memberships.enums import MembershipStatus
    from app.modules.memberships.models import Membership
    from app.modules.profiles.reliability import get_reliability
    from app.modules.tontines.enums import TontineStatus
    from app.modules.tontines.models import Tontine
    from app.modules.users.enums import UserStatus

    target = await session.get(User, user_id)
    if target is None or target.status != UserStatus.ACTIVE:
        return None
    reliability = await get_reliability(session, user_id)
    profile = await repositories.find_profile(session, user_id)
    active_tontines = await session.scalar(
        select(func.count())
        .select_from(Membership)
        .join(Tontine, Tontine.id == Membership.tontine_id)
        .where(
            Membership.user_id == user_id,
            Membership.status == MembershipStatus.ACTIVE,
            Tontine.status == TontineStatus.ACTIVE,
        )
    )
    completed_cycles = await session.scalar(
        select(func.count(func.distinct(Cycle.id)))
        .join(Membership, Membership.tontine_id == Cycle.tontine_id)
        .where(Membership.user_id == user_id, Cycle.status == CycleStatus.COMPLETED)
    )
    viewer_tontines = select(Membership.tontine_id).where(
        Membership.user_id == viewer.id, Membership.status == MembershipStatus.ACTIVE
    )
    shared = await session.scalars(
        select(Tontine.name)
        .join(Membership, Membership.tontine_id == Tontine.id)
        .where(
            Membership.user_id == user_id,
            Membership.status == MembershipStatus.ACTIVE,
            Tontine.id.in_(viewer_tontines),
        )
        .order_by(Tontine.name)
    )
    return PublicProfileRead(
        user_id=target.id,
        display_name=target.display_name,
        avatar_url=target.avatar_url,
        city=target.city,
        member_since=target.created_at,
        reliability=reliability,
        active_tontines=int(active_tontines or 0),
        completed_cycles=int(completed_cycles or 0),
        experience_level=profile.experience_level if profile else None,
        shared_tontines=list(shared),
    )
