from uuid import UUID

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.cycles.enums import CycleFrequency, CycleStatus
from app.modules.cycles.models import Cycle
from app.modules.memberships.enums import MembershipRole, MembershipStatus
from app.modules.memberships.models import Membership
from app.modules.tontines.enums import TontineStatus
from app.modules.tontines.models import Tontine
from app.modules.users.models import User

OPEN_CYCLE_STATUSES = (CycleStatus.DRAFT, CycleStatus.SCHEDULED, CycleStatus.ACTIVE)
# Une tontine ouverte se découvre dès sa phase de recrutement (brouillon) et
# tant qu'elle n'est pas archivée.
OPEN_TONTINE_STATUSES = (TontineStatus.DRAFT, TontineStatus.ACTIVE)


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


def _base_query(
    user_id: UUID, search: str | None, frequency: CycleFrequency | None = None
) -> Select:
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
    owner_id = (
        select(Membership.user_id)
        .where(
            Membership.tontine_id == Tontine.id,
            Membership.role == MembershipRole.OWNER,
            Membership.status == MembershipStatus.ACTIVE,
        )
        .limit(1)
        .correlate(Tontine)
        .scalar_subquery()
    )

    query = (
        select(Tontine, member_count.label("member_count"), Cycle, User)
        .outerjoin(Cycle, Cycle.id == reference_cycle)
        .outerjoin(User, User.id == owner_id)
        .where(
            Tontine.status.in_(OPEN_TONTINE_STATUSES),
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
    if frequency is not None:
        query = query.where(Cycle.frequency == frequency)
    return query


async def list_discoverable_tontines(
    session: AsyncSession,
    user_id: UUID,
    *,
    search: str | None = None,
    frequency: CycleFrequency | None = None,
) -> list[tuple[Tontine, int, Cycle | None, User | None]]:
    """Lister les tontines ouvertes que l'utilisateur n'a pas encore rejointes."""
    query = _base_query(user_id, search, frequency).order_by(
        Tontine.created_at.desc(), Tontine.id.desc()
    )
    rows = (await session.execute(query)).all()
    return [(row[0], int(row[1] or 0), row[2], row[3]) for row in rows]


async def get_discoverable_tontine(
    session: AsyncSession, user_id: UUID, tontine_id: UUID
) -> tuple[Tontine, int, Cycle | None, User | None] | None:
    row = (
        await session.execute(
            _base_query(user_id, None).where(Tontine.id == tontine_id)
        )
    ).first()
    return (row[0], int(row[1] or 0), row[2], row[3]) if row else None
