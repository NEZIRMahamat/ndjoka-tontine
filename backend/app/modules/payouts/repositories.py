from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.contributions.models import Contribution
from app.modules.memberships.enums import MembershipStatus
from app.modules.memberships.models import Membership
from app.modules.payouts.enums import PayoutStatus
from app.modules.payouts.models import Payout


async def find(session: AsyncSession, payout_id: UUID, *, lock: bool = False):
    query = select(Payout).where(Payout.id == payout_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    return await session.scalar(query)


async def for_cycle(session: AsyncSession, cycle_id: UUID):
    return list(
        await session.scalars(
            select(Payout)
            .where(Payout.cycle_id == cycle_id)
            .order_by(Payout.scheduled_for, Payout.id)
        )
    )


async def for_turn(session: AsyncSession, turn_id: UUID):
    return await session.scalar(
        select(Payout)
        .where(Payout.turn_id == turn_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


async def obligations(session: AsyncSession, turn_id: UUID):
    return list(
        await session.scalars(
            select(Contribution)
            .where(Contribution.turn_id == turn_id)
            .execution_options(populate_existing=True)
        )
    )


async def list_items(
    session: AsyncSession,
    *,
    cycle_id: UUID | None = None,
    user_id: UUID | None = None,
    status: PayoutStatus | None = None,
    limit: int = 20,
    offset: int = 0,
):
    query = select(Payout)
    if cycle_id is not None:
        query = query.where(Payout.cycle_id == cycle_id)
    if user_id is not None:
        query = query.join(
            Membership, Membership.id == Payout.beneficiary_membership_id
        ).where(
            Membership.user_id == user_id, Membership.status == MembershipStatus.ACTIVE
        )
    if status is not None:
        query = query.where(Payout.status == status)
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    items = list(
        await session.scalars(
            query.order_by(Payout.scheduled_for, Payout.id).limit(limit).offset(offset)
        )
    )
    return items, int(total or 0)


async def aggregate(session: AsyncSession, cycle_id: UUID):
    return (
        await session.execute(
            select(
                Payout.status,
                func.count(),
                func.sum(Payout.expected_amount),
                func.sum(Payout.available_amount),
            )
            .where(Payout.cycle_id == cycle_id)
            .group_by(Payout.status)
        )
    ).all()
