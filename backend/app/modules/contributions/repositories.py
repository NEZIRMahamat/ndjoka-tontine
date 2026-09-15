from datetime import datetime
from uuid import UUID

from sqlalchemy import String, case, cast, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.contributions.enums import (
    ContributionStatus,
    EffectiveContributionStatus,
)
from app.modules.contributions.models import Contribution
from app.modules.cycles.models import Cycle, CycleTurn
from app.modules.memberships.enums import MembershipStatus
from app.modules.memberships.models import Membership


def status_condition(status: EffectiveContributionStatus, now: datetime):
    if status == EffectiveContributionStatus.LATE:
        return Contribution.status.in_(
            [ContributionStatus.PENDING, ContributionStatus.REJECTED]
        ), Contribution.due_at < now
    if status in {
        EffectiveContributionStatus.PENDING,
        EffectiveContributionStatus.REJECTED,
    }:
        return Contribution.status == ContributionStatus(
            status.value
        ), Contribution.due_at >= now
    return (Contribution.status == ContributionStatus(status.value),)


async def aggregate_cycle(session: AsyncSession, cycle_id: UUID, now: datetime):
    state = case(
        (
            (
                Contribution.status.in_(
                    [ContributionStatus.PENDING, ContributionStatus.REJECTED]
                )
            )
            & (Contribution.due_at < now),
            "late",
        ),
        else_=cast(Contribution.status, String),
    )
    return (
        await session.execute(
            select(state, func.count(), func.sum(Contribution.amount_due))
            .where(Contribution.cycle_id == cycle_id)
            .group_by(state)
        )
    ).all()


async def find_contribution(
    session: AsyncSession, contribution_id: UUID, *, lock: bool = False
) -> Contribution | None:
    statement = select(Contribution).where(Contribution.id == contribution_id)
    if lock:
        statement = statement.with_for_update().execution_options(
            populate_existing=True
        )
    return await session.scalar(statement)


async def list_cycle_contributions(
    session: AsyncSession,
    cycle_id: UUID,
    *,
    limit: int,
    offset: int,
    status: EffectiveContributionStatus | None,
    now: datetime,
) -> tuple[list[Contribution], int]:
    conditions = [Contribution.cycle_id == cycle_id]
    if status is not None:
        conditions.extend(status_condition(status, now))
    rows = await session.scalars(
        select(Contribution)
        .where(*conditions)
        .order_by(Contribution.due_at, Contribution.id)
        .limit(limit)
        .offset(offset)
    )
    total = await session.scalar(
        select(func.count()).select_from(Contribution).where(*conditions)
    )
    return list(rows), int(total or 0)


async def list_user_contributions(
    session: AsyncSession,
    user_id: UUID,
    *,
    limit: int,
    offset: int,
    status: EffectiveContributionStatus | None,
    now: datetime,
) -> tuple[list[Contribution], int]:
    conditions = [
        Membership.user_id == user_id,
        Membership.status == MembershipStatus.ACTIVE,
    ]
    if status is not None:
        conditions.extend(status_condition(status, now))
    statement = (
        select(Contribution)
        .join(Membership, Membership.id == Contribution.membership_id)
        .where(*conditions)
    )
    rows = await session.scalars(
        statement.order_by(Contribution.due_at, Contribution.id)
        .limit(limit)
        .offset(offset)
    )
    total = await session.scalar(
        select(func.count())
        .select_from(Contribution)
        .join(Membership, Membership.id == Contribution.membership_id)
        .where(*conditions)
    )
    return list(rows), int(total or 0)


async def existing_pairs(
    session: AsyncSession, cycle_id: UUID
) -> set[tuple[UUID, UUID]]:
    rows = await session.execute(
        select(Contribution.turn_id, Contribution.membership_id).where(
            Contribution.cycle_id == cycle_id
        )
    )
    return set(rows.tuples())


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


async def cycle_for_contribution(
    session: AsyncSession, contribution: Contribution
) -> Cycle | None:
    return await session.get(Cycle, contribution.cycle_id)


async def turn_for_contribution(
    session: AsyncSession, contribution: Contribution
) -> CycleTurn | None:
    return await session.get(CycleTurn, contribution.turn_id)


async def cancel_unconfirmed(session: AsyncSession, cycle_id: UUID) -> None:
    await session.execute(
        update(Contribution)
        .where(
            Contribution.cycle_id == cycle_id,
            Contribution.status != ContributionStatus.CONFIRMED,
        )
        .values(
            status=ContributionStatus.CANCELLED,
            declared_at=None,
            confirmed_at=None,
            confirmed_by_user_id=None,
            rejected_at=None,
            rejected_by_user_id=None,
            rejection_reason=None,
        )
    )


async def count_cycle(session: AsyncSession, cycle_id: UUID) -> int:
    return int(
        await session.scalar(
            select(func.count())
            .select_from(Contribution)
            .where(Contribution.cycle_id == cycle_id)
        )
        or 0
    )
