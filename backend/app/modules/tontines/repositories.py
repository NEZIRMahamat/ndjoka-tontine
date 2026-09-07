from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.memberships.enums import MembershipStatus
from app.modules.memberships.models import Membership
from app.modules.tontines.enums import TontineStatus
from app.modules.tontines.models import Tontine


async def insert_tontine(session: AsyncSession, tontine: Tontine) -> Tontine:
    session.add(tontine)
    await session.flush()
    return tontine


async def find_accessible_tontine(
    session: AsyncSession,
    tontine_id: UUID,
    user_id: UUID,
    *,
    lock: bool = False,
) -> Tontine | None:
    statement = (
        select(Tontine)
        .join(Membership, Membership.tontine_id == Tontine.id)
        .where(
            Tontine.id == tontine_id,
            Membership.user_id == user_id,
            Membership.status == MembershipStatus.ACTIVE,
        )
    )
    if lock:
        statement = statement.with_for_update().execution_options(
            populate_existing=True
        )
    return await session.scalar(statement)


async def list_accessible_tontines(
    session: AsyncSession,
    user_id: UUID,
    *,
    limit: int,
    offset: int,
    status: TontineStatus | None = None,
) -> tuple[list[Tontine], int]:
    conditions = [
        Membership.user_id == user_id,
        Membership.status == MembershipStatus.ACTIVE,
    ]
    if status is not None:
        conditions.append(Tontine.status == status)
    rows = await session.scalars(
        select(Tontine)
        .join(Membership, Membership.tontine_id == Tontine.id)
        .where(*conditions)
        .order_by(Tontine.created_at.desc(), Tontine.id.desc())
        .limit(limit)
        .offset(offset)
    )
    total = await session.scalar(
        select(func.count())
        .select_from(Tontine)
        .join(Membership, Membership.tontine_id == Tontine.id)
        .where(*conditions)
    )
    return list(rows), int(total or 0)
