from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.contributions import repositories
from app.modules.contributions.enums import (
    ContributionStatus,
    EffectiveContributionStatus,
)
from app.modules.contributions.models import Contribution
from app.modules.contributions.schemas import (
    ContributionDeclare,
    ContributionReject,
    ContributionSummary,
)
from app.modules.cycles.enums import CycleStatus
from app.modules.cycles.models import Cycle
from app.modules.memberships.enums import MembershipRole
from app.modules.memberships.models import Membership
from app.modules.users.models import User

FINANCIAL_ROLES = {
    MembershipRole.OWNER,
    MembershipRole.MANAGER,
    MembershipRole.TREASURER,
}


class ContributionError(Exception):
    def __init__(self, detail: str, status_code: int) -> None:
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


def effective_status(
    item: Contribution, now: datetime | None = None
) -> EffectiveContributionStatus:
    now = now or datetime.now(UTC)
    if (
        item.status in {ContributionStatus.PENDING, ContributionStatus.REJECTED}
        and item.due_at < now
    ):
        return EffectiveContributionStatus.LATE
    return EffectiveContributionStatus(item.status.value)


def require_financial_role(membership: Membership) -> None:
    if membership.role not in FINANCIAL_ROLES:
        raise ContributionError("Rôle financier insuffisant", 403)


def require_generation_role(membership: Membership) -> None:
    if membership.role not in {MembershipRole.OWNER, MembershipRole.MANAGER}:
        raise ContributionError(
            "Rôle interne insuffisant pour générer les cotisations", 403
        )


async def generate_for_cycle(session: AsyncSession, cycle: Cycle) -> int:
    if cycle.status not in {CycleStatus.SCHEDULED, CycleStatus.ACTIVE}:
        raise ContributionError(
            "Les cotisations exigent un cycle planifié ou actif", 409
        )
    active = await repositories.active_memberships(session, cycle.tontine_id)
    participant_ids = {turn.beneficiary_membership_id for turn in cycle.turns}
    if not participant_ids or (
        cycle.status == CycleStatus.SCHEDULED
        and participant_ids != {member.id for member in active}
    ):
        raise ContributionError("Le calendrier du cycle est incomplet", 409)
    existing = await repositories.existing_pairs(session, cycle.id)
    created = 0
    for turn in cycle.turns:
        for membership_id in participant_ids:
            if (
                not cycle.beneficiary_contributes
                and membership_id == turn.beneficiary_membership_id
            ):
                continue
            if (turn.id, membership_id) in existing:
                continue
            session.add(
                Contribution(
                    cycle_id=cycle.id,
                    turn_id=turn.id,
                    membership_id=membership_id,
                    amount_due=cycle.contribution_amount,
                    status=ContributionStatus.PENDING,
                    due_at=turn.scheduled_for,
                )
            )
            created += 1
    await session.flush()
    return created


async def generate_contributions(
    session: AsyncSession, cycle: Cycle, membership: Membership
) -> int:
    require_generation_role(membership)
    try:
        created = await generate_for_cycle(session, cycle)
        await session.commit()
        return created
    except Exception:
        await session.rollback()
        raise


async def cancel_unconfirmed_for_cycle(session: AsyncSession, cycle_id: UUID) -> None:
    await repositories.cancel_unconfirmed(session, cycle_id)


async def get_contribution(
    session: AsyncSession, contribution_id: UUID, actor: User, *, lock: bool = False
) -> tuple[Contribution, Membership]:
    contribution = await repositories.find_contribution(session, contribution_id)
    if contribution is None:
        raise ContributionError("Cotisation introuvable", 404)
    cycle = await repositories.cycle_for_contribution(session, contribution)
    if cycle is None:
        raise ContributionError("Cotisation introuvable", 404)
    actor_membership = next(
        (
            item
            for item in await repositories.active_memberships(session, cycle.tontine_id)
            if item.user_id == actor.id
        ),
        None,
    )
    if actor_membership is None:
        raise ContributionError("Cotisation introuvable", 404)
    if (
        contribution.membership_id != actor_membership.id
        and actor_membership.role not in FINANCIAL_ROLES
    ):
        raise ContributionError("Cotisation introuvable", 404)
    if lock:
        from app.modules.cycles.services import get_cycle
        from app.modules.memberships.repositories import find_membership

        await get_cycle(session, cycle.tontine_id, cycle.id, lock=True)
        actor_membership = await find_membership(
            session, cycle.tontine_id, actor.id, active_only=True, lock=True
        )
        if actor_membership is None or (
            contribution.membership_id != actor_membership.id
            and actor_membership.role not in FINANCIAL_ROLES
        ):
            raise ContributionError("Cotisation introuvable", 404)
        contribution = await repositories.find_contribution(
            session, contribution_id, lock=True
        )
    return contribution, actor_membership


async def declare_contribution(
    session: AsyncSession,
    contribution_id: UUID,
    actor: User,
    payload: ContributionDeclare,
) -> Contribution:
    try:
        item, membership = await get_contribution(
            session, contribution_id, actor, lock=True
        )
        if item.membership_id != membership.id:
            raise ContributionError(
                "Seul le membre concerné peut déclarer cette cotisation", 403
            )
        if item.status not in {ContributionStatus.PENDING, ContributionStatus.REJECTED}:
            raise ContributionError("Cette cotisation ne peut pas être déclarée", 409)
        item.status = ContributionStatus.DECLARED
        item.declared_at = datetime.now(UTC)
        item.declaration_reference = payload.declaration_reference
        item.declaration_note = payload.declaration_note
        item.rejected_at = None
        item.rejected_by_user_id = None
        item.rejection_reason = None
        await session.commit()
        await session.refresh(item)
        return item
    except Exception:
        if session.in_transaction():
            await session.rollback()
        raise


async def confirm_contribution(
    session: AsyncSession, contribution_id: UUID, actor: User
) -> Contribution:
    try:
        item, membership = await get_contribution(
            session, contribution_id, actor, lock=True
        )
        require_financial_role(membership)
        if item.status != ContributionStatus.DECLARED:
            raise ContributionError(
                "Seule une cotisation déclarée peut être confirmée", 409
            )
        item.status = ContributionStatus.CONFIRMED
        item.confirmed_at = datetime.now(UTC)
        item.confirmed_by_user_id = actor.id
        await session.flush()
        from app.modules.payouts.services import refresh_for_turn

        cycle = await repositories.cycle_for_contribution(session, item)
        await refresh_for_turn(session, cycle, item.turn_id)
        await session.commit()
        await session.refresh(item)
        return item
    except Exception:
        if session.in_transaction():
            await session.rollback()
        raise


async def reject_contribution(
    session: AsyncSession,
    contribution_id: UUID,
    actor: User,
    payload: ContributionReject,
) -> Contribution:
    try:
        item, membership = await get_contribution(
            session, contribution_id, actor, lock=True
        )
        require_financial_role(membership)
        if item.status != ContributionStatus.DECLARED:
            raise ContributionError(
                "Seule une cotisation déclarée peut être rejetée", 409
            )
        item.status = ContributionStatus.REJECTED
        item.rejected_at = datetime.now(UTC)
        item.rejected_by_user_id = actor.id
        item.rejection_reason = payload.reason
        item.declared_at = None
        await session.commit()
        await session.refresh(item)
        return item
    except Exception:
        if session.in_transaction():
            await session.rollback()
        raise


async def summary(session: AsyncSession, cycle_id: UUID) -> ContributionSummary:
    groups = await repositories.aggregate_cycle(session, cycle_id, datetime.now(UTC))
    counts = {status: 0 for status in EffectiveContributionStatus}
    amounts = {status: Decimal("0") for status in EffectiveContributionStatus}
    for state, count, amount in groups:
        counts[EffectiveContributionStatus(state)] = count
        amounts[EffectiveContributionStatus(state)] = amount
    return ContributionSummary(
        cycle_id=cycle_id,
        obligations_total=sum(counts.values()),
        expected_amount=sum(amounts.values(), Decimal("0"))
        - amounts[EffectiveContributionStatus.CANCELLED],
        declared_amount=amounts[EffectiveContributionStatus.DECLARED],
        confirmed_amount=amounts[EffectiveContributionStatus.CONFIRMED],
        late_amount=amounts[EffectiveContributionStatus.LATE],
        pending_count=counts[EffectiveContributionStatus.PENDING],
        declared_count=counts[EffectiveContributionStatus.DECLARED],
        confirmed_count=counts[EffectiveContributionStatus.CONFIRMED],
        rejected_count=counts[EffectiveContributionStatus.REJECTED],
        late_count=counts[EffectiveContributionStatus.LATE],
        cancelled_count=counts[EffectiveContributionStatus.CANCELLED],
    )
