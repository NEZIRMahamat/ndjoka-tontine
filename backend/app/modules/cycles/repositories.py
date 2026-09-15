from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.cycles.enums import CycleStatus
from app.modules.cycles.models import Cycle, CycleTurn
from app.modules.memberships.enums import MembershipStatus
from app.modules.memberships.models import Membership
from app.modules.tontines.models import Tontine


async def lock_tontine(session: AsyncSession, tontine_id: UUID) -> Tontine | None:
    return await session.scalar(
        select(Tontine)
        .where(Tontine.id == tontine_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


async def next_sequence_number(session: AsyncSession, tontine_id: UUID) -> int:
    current = await session.scalar(
        select(func.max(Cycle.sequence_number)).where(Cycle.tontine_id == tontine_id)
    )
    return int(current or 0) + 1


async def insert_cycle(session: AsyncSession, cycle: Cycle) -> Cycle:
    session.add(cycle)
    await session.flush()
    return cycle


async def find_cycle(
    session: AsyncSession, tontine_id: UUID, cycle_id: UUID, *, lock: bool = False
) -> Cycle | None:
    statement = (
        select(Cycle)
        .options(selectinload(Cycle.turns))
        .where(Cycle.id == cycle_id, Cycle.tontine_id == tontine_id)
        .execution_options(populate_existing=True)
    )
    if lock:
        statement = statement.with_for_update()
    return await session.scalar(statement)


async def list_cycles(
    session: AsyncSession, tontine_id: UUID, *, limit: int, offset: int
) -> tuple[list[Cycle], int]:
    condition = Cycle.tontine_id == tontine_id
    rows = await session.scalars(
        select(Cycle)
        .options(selectinload(Cycle.turns))
        .where(condition)
        .order_by(Cycle.sequence_number.desc())
        .limit(limit)
        .offset(offset)
    )
    total = await session.scalar(
        select(func.count()).select_from(Cycle).where(condition)
    )
    return list(rows), int(total or 0)


async def active_memberships(
    session: AsyncSession, tontine_id: UUID
) -> list[Membership]:
    rows = await session.scalars(
        select(Membership)
        .where(
            Membership.tontine_id == tontine_id,
            Membership.status == MembershipStatus.ACTIVE,
        )
        .order_by(Membership.joined_at, Membership.id)
    )
    return list(rows)


async def delete_turns(session: AsyncSession, cycle_id: UUID) -> None:
    await session.execute(delete(CycleTurn).where(CycleTurn.cycle_id == cycle_id))


async def has_other_active_cycle(
    session: AsyncSession, tontine_id: UUID, cycle_id: UUID
) -> bool:
    found = await session.scalar(
        select(Cycle.id)
        .where(
            Cycle.tontine_id == tontine_id,
            Cycle.status == CycleStatus.ACTIVE,
            Cycle.id != cycle_id,
        )
        .limit(1)
    )
    return found is not None
