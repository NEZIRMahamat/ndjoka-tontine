import calendar
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.cycles import repositories
from app.modules.cycles.enums import CycleFrequency, CycleStatus
from app.modules.cycles.models import Cycle, CycleTurn
from app.modules.cycles.schemas import CycleCreate, CycleUpdate, TurnOrderUpdate
from app.modules.memberships.enums import MembershipRole
from app.modules.memberships.models import Membership
from app.modules.tontines.enums import TontineStatus
from app.modules.tontines.models import Tontine
from app.modules.users.models import User


class CycleError(Exception):
    def __init__(self, detail: str, status_code: int) -> None:
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


def require_role(membership: Membership, *roles: MembershipRole) -> None:
    if membership.role not in roles:
        raise CycleError("Rôle interne insuffisant", 403)


def require_draft(cycle: Cycle) -> None:
    if cycle.status != CycleStatus.DRAFT:
        raise CycleError("Seul un cycle en brouillon peut être modifié", 409)


def add_months(value: date, count: int) -> date:
    month_index = value.month - 1 + count
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, min(value.day, calendar.monthrange(year, month)[1]))


def scheduled_datetime(cycle: Cycle, position: int) -> datetime:
    day = (
        cycle.start_date + timedelta(weeks=position - 1)
        if cycle.frequency == CycleFrequency.WEEKLY
        else add_months(cycle.start_date, position - 1)
    )
    return datetime.combine(day, time.min, ZoneInfo(cycle.timezone)).astimezone(UTC)


async def get_cycle(
    session: AsyncSession, tontine_id: UUID, cycle_id: UUID, *, lock: bool = False
) -> Cycle:
    if lock:
        tontine = await repositories.lock_tontine(session, tontine_id)
        if tontine is None:
            raise CycleError("Tontine introuvable", 404)
        if tontine.status == TontineStatus.ARCHIVED:
            raise CycleError("Une tontine archivée est en lecture seule", 409)
    cycle = await repositories.find_cycle(session, tontine_id, cycle_id, lock=lock)
    if cycle is None:
        raise CycleError("Cycle introuvable", 404)
    return cycle


async def create_cycle(
    session: AsyncSession,
    actor: User,
    membership: Membership,
    tontine: Tontine,
    payload: CycleCreate,
) -> Cycle:
    require_role(membership, MembershipRole.OWNER, MembershipRole.MANAGER)
    try:
        locked = await repositories.lock_tontine(session, tontine.id)
        if locked is None:
            raise CycleError("Tontine introuvable", 404)
        if locked.status == TontineStatus.ARCHIVED:
            raise CycleError("Une tontine archivée ne peut pas recevoir de cycle", 409)
        cycle = Cycle(
            tontine_id=tontine.id,
            sequence_number=await repositories.next_sequence_number(
                session, tontine.id
            ),
            created_by_user_id=actor.id,
            status=CycleStatus.DRAFT,
            **payload.model_dump(),
        )
        await repositories.insert_cycle(session, cycle)
        await session.commit()
        return await get_cycle(session, tontine.id, cycle.id)
    except IntegrityError as exc:
        await session.rollback()
        raise CycleError(
            "Création concurrente du cycle, veuillez réessayer", 409
        ) from exc
    except Exception:
        await session.rollback()
        raise


async def list_cycles(
    session: AsyncSession, tontine_id: UUID, *, limit: int, offset: int
) -> tuple[list[Cycle], int]:
    return await repositories.list_cycles(
        session, tontine_id, limit=limit, offset=offset
    )


async def update_cycle(
    session: AsyncSession,
    tontine_id: UUID,
    cycle_id: UUID,
    membership: Membership,
    payload: CycleUpdate,
) -> Cycle:
    require_role(membership, MembershipRole.OWNER, MembershipRole.MANAGER)
    try:
        cycle = await get_cycle(session, tontine_id, cycle_id, lock=True)
        require_draft(cycle)
        changes = payload.model_dump(exclude_unset=True)
        if not changes:
            raise CycleError("Au moins un champ doit être fourni", 400)
        calendar_changed = bool(
            {"frequency", "start_date", "timezone"} & changes.keys()
        )
        for field, value in changes.items():
            setattr(cycle, field, value)
        if calendar_changed and cycle.turns:
            for turn in cycle.turns:
                turn.scheduled_for = scheduled_datetime(cycle, turn.position)
        await session.commit()
        return await get_cycle(session, tontine_id, cycle_id)
    except Exception:
        if session.in_transaction():
            await session.rollback()
        raise


async def replace_turns(
    session: AsyncSession, cycle: Cycle, memberships: list[Membership]
) -> Cycle:
    await repositories.delete_turns(session, cycle.id)
    await session.flush()
    for position, beneficiary in enumerate(memberships, 1):
        session.add(
            CycleTurn(
                cycle_id=cycle.id,
                position=position,
                beneficiary_membership_id=beneficiary.id,
                scheduled_for=scheduled_datetime(cycle, position),
            )
        )
    await session.flush()
    return cycle


async def generate_turns(
    session: AsyncSession, tontine_id: UUID, cycle_id: UUID, membership: Membership
) -> Cycle:
    require_role(membership, MembershipRole.OWNER, MembershipRole.MANAGER)
    try:
        cycle = await get_cycle(session, tontine_id, cycle_id, lock=True)
        require_draft(cycle)
        active = await repositories.active_memberships(session, tontine_id)
        if not active:
            raise CycleError("Aucun membre actif pour générer le calendrier", 409)
        await replace_turns(session, cycle, active)
        await session.commit()
        return await get_cycle(session, tontine_id, cycle_id)
    except Exception:
        if session.in_transaction():
            await session.rollback()
        raise


async def reorder_turns(
    session: AsyncSession,
    tontine_id: UUID,
    cycle_id: UUID,
    membership: Membership,
    payload: TurnOrderUpdate,
) -> Cycle:
    require_role(membership, MembershipRole.OWNER, MembershipRole.MANAGER)
    try:
        cycle = await get_cycle(session, tontine_id, cycle_id, lock=True)
        require_draft(cycle)
        active = await repositories.active_memberships(session, tontine_id)
        by_id = {item.id: item for item in active}
        if set(payload.membership_ids) != set(by_id):
            raise CycleError(
                "L'ordre doit contenir exactement tous les membres actifs de la tontine",
                409,
            )
        await replace_turns(
            session, cycle, [by_id[item_id] for item_id in payload.membership_ids]
        )
        await session.commit()
        return await get_cycle(session, tontine_id, cycle_id)
    except Exception:
        if session.in_transaction():
            await session.rollback()
        raise


async def ensure_complete_order(session: AsyncSession, cycle: Cycle) -> None:
    active = await repositories.active_memberships(session, cycle.tontine_id)
    if len(cycle.turns) != len(active) or {
        turn.beneficiary_membership_id for turn in cycle.turns
    } != {item.id for item in active}:
        raise CycleError(
            "L'ordre des bénéficiaires doit contenir tous les membres actifs", 409
        )


async def schedule_cycle(
    session: AsyncSession, tontine_id: UUID, cycle_id: UUID, membership: Membership
) -> Cycle:
    require_role(membership, MembershipRole.OWNER, MembershipRole.MANAGER)
    try:
        cycle = await get_cycle(session, tontine_id, cycle_id, lock=True)
        require_draft(cycle)
        await ensure_complete_order(session, cycle)
        cycle.status = CycleStatus.SCHEDULED
        await session.commit()
        return await get_cycle(session, tontine_id, cycle_id)
    except Exception:
        if session.in_transaction():
            await session.rollback()
        raise


async def activate_cycle(
    session: AsyncSession, tontine_id: UUID, cycle_id: UUID, membership: Membership
) -> Cycle:
    require_role(membership, MembershipRole.OWNER, MembershipRole.MANAGER)
    try:
        tontine = await repositories.lock_tontine(session, tontine_id)
        if tontine is None:
            raise CycleError("Tontine introuvable", 404)
        cycle = await get_cycle(session, tontine_id, cycle_id, lock=True)
        if cycle.status != CycleStatus.SCHEDULED:
            raise CycleError("Seul un cycle planifié peut être activé", 409)
        await ensure_complete_order(session, cycle)
        if await repositories.has_other_active_cycle(session, tontine_id, cycle_id):
            raise CycleError("Un autre cycle est déjà actif pour cette tontine", 409)
        cycle.status = CycleStatus.ACTIVE
        cycle.activated_at = datetime.now(UTC)
        if tontine.status == TontineStatus.DRAFT:
            tontine.status = TontineStatus.ACTIVE
        from app.modules.contributions.services import generate_for_cycle

        await generate_for_cycle(session, cycle)
        from app.modules.payouts.services import generate_for_cycle as generate_payouts

        await generate_payouts(session, cycle)
        await session.commit()
        return await get_cycle(session, tontine_id, cycle_id)
    except IntegrityError as exc:
        await session.rollback()
        raise CycleError(
            "Un autre cycle est déjà actif pour cette tontine", 409
        ) from exc
    except Exception:
        if session.in_transaction():
            await session.rollback()
        raise


async def complete_cycle(
    session: AsyncSession, tontine_id: UUID, cycle_id: UUID, membership: Membership
) -> Cycle:
    require_role(membership, MembershipRole.OWNER, MembershipRole.MANAGER)
    try:
        cycle = await get_cycle(session, tontine_id, cycle_id, lock=True)
        if cycle.status != CycleStatus.ACTIVE:
            raise CycleError("Seul un cycle actif peut être terminé", 409)
        cycle.status = CycleStatus.COMPLETED
        cycle.completed_at = datetime.now(UTC)
        await session.commit()
        return await get_cycle(session, tontine_id, cycle_id)
    except Exception:
        if session.in_transaction():
            await session.rollback()
        raise


async def cancel_cycle(
    session: AsyncSession, tontine_id: UUID, cycle_id: UUID, membership: Membership
) -> Cycle:
    require_role(membership, MembershipRole.OWNER)
    try:
        cycle = await get_cycle(session, tontine_id, cycle_id, lock=True)
        if cycle.status not in {
            CycleStatus.DRAFT,
            CycleStatus.SCHEDULED,
            CycleStatus.ACTIVE,
        }:
            raise CycleError("Ce cycle ne peut plus être annulé", 409)
        cycle.status = CycleStatus.CANCELLED
        cycle.cancelled_at = datetime.now(UTC)
        from app.modules.contributions.services import cancel_unconfirmed_for_cycle

        await cancel_unconfirmed_for_cycle(session, cycle.id)
        from app.modules.payouts.services import cancel_for_cycle

        await cancel_for_cycle(session, cycle.id)
        await session.commit()
        return await get_cycle(session, tontine_id, cycle_id)
    except Exception:
        if session.in_transaction():
            await session.rollback()
        raise
