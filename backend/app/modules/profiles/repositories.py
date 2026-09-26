from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.contributions.enums import ContributionStatus
from app.modules.contributions.models import Contribution
from app.modules.cycles.enums import CycleStatus
from app.modules.cycles.models import Cycle
from app.modules.memberships.enums import MembershipStatus
from app.modules.memberships.models import Membership
from app.modules.profiles.models import SaverProfile


async def find_profile(session: AsyncSession, user_id: UUID) -> SaverProfile | None:
    return await session.scalar(
        select(SaverProfile).where(SaverProfile.user_id == user_id)
    )


async def upsert_profile(
    session: AsyncSession, user_id: UUID, values: dict
) -> SaverProfile:
    profile = await find_profile(session, user_id)
    if profile is None:
        profile = SaverProfile(user_id=user_id, **values)
        session.add(profile)
    else:
        for field, value in values.items():
            setattr(profile, field, value)
    await session.flush()
    return profile


async def delete_profile(session: AsyncSession, user_id: UUID) -> bool:
    profile = await find_profile(session, user_id)
    if profile is None:
        return False
    await session.delete(profile)
    await session.flush()
    return True


@dataclass(frozen=True)
class ReliabilityFacts:
    """Indicateurs comportementaux bruts servant au calcul du score."""

    contributions_total: int
    contributions_on_time: int
    contributions_late: int
    contributions_outstanding: int
    cycles_completed: int


async def collect_reliability_facts(
    session: AsyncSession, user_id: UUID, now: datetime
) -> ReliabilityFacts:
    """Agréger l'historique réel de cotisations et de cycles de l'utilisateur."""
    membership_filter = (
        select(Membership.id)
        .where(
            Membership.user_id == user_id,
            Membership.status == MembershipStatus.ACTIVE,
        )
        .scalar_subquery()
    )

    settled = Contribution.status == ContributionStatus.CONFIRMED
    on_time = settled & (Contribution.confirmed_at <= Contribution.due_at)
    late = settled & (Contribution.confirmed_at > Contribution.due_at)
    outstanding = Contribution.status.in_(
        [ContributionStatus.PENDING, ContributionStatus.REJECTED]
    ) & (Contribution.due_at < now)

    row = (
        await session.execute(
            select(
                func.count().filter(settled | outstanding),
                func.count().filter(on_time),
                func.count().filter(late),
                func.count().filter(outstanding),
            ).where(Contribution.membership_id.in_(membership_filter))
        )
    ).one()

    cycles_completed = await session.scalar(
        select(func.count(func.distinct(Cycle.id)))
        .join(Membership, Membership.tontine_id == Cycle.tontine_id)
        .where(
            Membership.user_id == user_id,
            Membership.status == MembershipStatus.ACTIVE,
            Cycle.status == CycleStatus.COMPLETED,
        )
    )

    return ReliabilityFacts(
        contributions_total=int(row[0] or 0),
        contributions_on_time=int(row[1] or 0),
        contributions_late=int(row[2] or 0),
        contributions_outstanding=int(row[3] or 0),
        cycles_completed=int(cycles_completed or 0),
    )
