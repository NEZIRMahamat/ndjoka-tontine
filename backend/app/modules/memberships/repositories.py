from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.memberships.enums import InvitationStatus, MembershipStatus
from app.modules.memberships.models import Invitation, Membership
from app.modules.tontines.models import Tontine
from app.modules.users.models import User


async def insert_membership(
    session: AsyncSession, membership: Membership
) -> Membership:
    session.add(membership)
    await session.flush()
    return membership


async def find_membership(
    session: AsyncSession,
    tontine_id: UUID,
    user_id: UUID,
    *,
    active_only: bool = False,
    lock: bool = False,
) -> Membership | None:
    statement = select(Membership).where(
        Membership.tontine_id == tontine_id,
        Membership.user_id == user_id,
    )
    if active_only:
        statement = statement.where(Membership.status == MembershipStatus.ACTIVE)
    if lock:
        statement = statement.with_for_update().execution_options(
            populate_existing=True
        )
    return await session.scalar(statement)


async def find_membership_by_id(
    session: AsyncSession, tontine_id: UUID, user_id: UUID, *, lock: bool = False
) -> Membership | None:
    return await find_membership(session, tontine_id, user_id, lock=lock)


async def list_memberships(
    session: AsyncSession,
    tontine_id: UUID,
    *,
    limit: int,
    offset: int,
) -> tuple[list[Membership], int]:
    condition = Membership.tontine_id == tontine_id
    rows = await session.scalars(
        select(Membership)
        .where(condition)
        .order_by(Membership.joined_at, Membership.id)
        .limit(limit)
        .offset(offset)
    )
    total = await session.scalar(
        select(func.count()).select_from(Membership).where(condition)
    )
    return list(rows), int(total or 0)


async def count_active_members(session: AsyncSession, tontine_id: UUID) -> int:
    total = await session.scalar(
        select(func.count())
        .select_from(Membership)
        .where(
            Membership.tontine_id == tontine_id,
            Membership.status == MembershipStatus.ACTIVE,
        )
    )
    return int(total or 0)


async def find_user_by_email(session: AsyncSession, email: str) -> User | None:
    return await session.scalar(select(User).where(func.lower(User.email) == email))


async def insert_invitation(
    session: AsyncSession, invitation: Invitation
) -> Invitation:
    session.add(invitation)
    await session.flush()
    return invitation


async def find_invitation(
    session: AsyncSession,
    tontine_id: UUID,
    invitation_id: UUID,
    *,
    lock: bool = False,
) -> Invitation | None:
    statement = select(Invitation).where(
        Invitation.id == invitation_id,
        Invitation.tontine_id == tontine_id,
    )
    if lock:
        statement = statement.with_for_update().execution_options(
            populate_existing=True
        )
    return await session.scalar(statement)


async def find_invitation_by_token_hash(
    session: AsyncSession, token_hash: str, *, lock: bool = False
) -> Invitation | None:
    statement = select(Invitation).where(Invitation.token_hash == token_hash)
    if lock:
        statement = statement.with_for_update().execution_options(
            populate_existing=True
        )
    return await session.scalar(statement)


async def find_pending_invitation(
    session: AsyncSession, tontine_id: UUID, email: str
) -> Invitation | None:
    return await session.scalar(
        select(Invitation).where(
            Invitation.tontine_id == tontine_id,
            Invitation.email == email,
            Invitation.status == InvitationStatus.PENDING,
        )
    )


async def list_invitations(
    session: AsyncSession,
    tontine_id: UUID,
    *,
    limit: int,
    offset: int,
) -> tuple[list[Invitation], int]:
    condition = Invitation.tontine_id == tontine_id
    rows = await session.scalars(
        select(Invitation)
        .where(condition)
        .order_by(Invitation.created_at.desc(), Invitation.id.desc())
        .limit(limit)
        .offset(offset)
    )
    total = await session.scalar(
        select(func.count()).select_from(Invitation).where(condition)
    )
    return list(rows), int(total or 0)


async def expire_pending_invitations(
    session: AsyncSession, tontine_id: UUID, now: datetime
) -> None:
    await session.execute(
        update(Invitation)
        .where(
            Invitation.tontine_id == tontine_id,
            Invitation.status == InvitationStatus.PENDING,
            Invitation.expires_at <= now,
        )
        .values(status=InvitationStatus.EXPIRED)
    )


async def lock_tontine(session: AsyncSession, tontine_id: UUID) -> Tontine | None:
    return await session.scalar(
        select(Tontine)
        .where(Tontine.id == tontine_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
