from uuid import UUID

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.cycles.enums import CycleStatus
from app.modules.cycles.models import Cycle
from app.modules.memberships.enums import MembershipStatus
from app.modules.memberships.models import Membership
from app.modules.tontines.enums import TontineStatus
from app.modules.tontines.models import Tontine

OPEN_CYCLE_STATUSES = (CycleStatus.DRAFT, CycleStatus.SCHEDULED, CycleStatus.ACTIVE)


def _member_count_subquery():
    return (
        select(func.count())
        .select_from(Membership)
        .where(
            Membership.tontine_id == Tontine.id,
            Membership.status == MembershipStatus.ACTIVE,
        )
        .correlate(Tontine)
        .scalar_subquery()
    )


def _reference_cycle_subquery():
    """Cycle représentatif : le plus avancé encore ouvert, sinon le plus récent."""
    return (
        select(Cycle.id)
        .where(Cycle.tontine_id == Tontine.id)
        .order_by(
            Cycle.status.in_(OPEN_CYCLE_STATUSES).desc(),
            Cycle.sequence_number.desc(),
        )
        .limit(1)
        .correlate(Tontine)
        .scalar_subquery()
    )


def _base_query(user_id: UUID, search: str | None) -> Select:
    member_count = _member_count_subquery()
    already_member = (
        select(Membership.id)
        .where(
            Membership.tontine_id == Tontine.id,
            Membership.user_id == user_id,
            Membership.status == MembershipStatus.ACTIVE,
        )
        .correlate(Tontine)
        .exists()
    )
    reference_cycle = _reference_cycle_subquery()

    query = (
        select(Tontine, member_count.label("member_count"), Cycle)
        .outerjoin(Cycle, Cycle.id == reference_cycle)
        .where(
            Tontine.status == TontineStatus.ACTIVE,
            Tontine.is_discoverable.is_(True),
            ~already_member,
            or_(Tontine.max_members.is_(None), member_count < Tontine.max_members),
        )
    )
    if search:
        pattern = f"%{search.lower()}%"
        query = query.where(
            or_(
                func.lower(Tontine.name).like(pattern),
                func.lower(func.coalesce(Tontine.description, "")).like(pattern),
            )
        )
    return query


async def list_discoverable_tontines(
    session: AsyncSession, user_id: UUID, *, search: str | None = None
) -> list[tuple[Tontine, int, Cycle | None]]:
    """Lister les tontines ouvertes que l'utilisateur n'a pas encore rejointes."""
    query = _base_query(user_id, search).order_by(
        Tontine.created_at.desc(), Tontine.id.desc()
    )
    rows = (await session.execute(query)).all()
    return [(row[0], int(row[1] or 0), row[2]) for row in rows]
