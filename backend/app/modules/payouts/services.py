from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.services import change, record
from app.modules.contributions.enums import ContributionStatus
from app.modules.cycles.enums import CycleStatus
from app.modules.cycles.models import Cycle
from app.modules.cycles.services import CycleError, get_cycle
from app.modules.fees.pricing import quote_from_gross
from app.modules.memberships import repositories as membership_repository
from app.modules.memberships.enums import MembershipRole
from app.modules.memberships.models import Membership
from app.modules.notifications.service import (
    enqueue_event,
    recipient,
    tontine_recipients,
)
from app.modules.payouts import repositories
from app.modules.payouts.enums import PayoutStatus
from app.modules.payouts.models import Payout
from app.modules.payouts.schemas import PayoutRead, PayoutSummary
from app.modules.tontines.models import Tontine
from app.modules.users.models import User

ZERO = Decimal("0.00")
MANAGERS = {MembershipRole.OWNER, MembershipRole.MANAGER}
FINANCIAL = MANAGERS | {MembershipRole.TREASURER}
UNPAID = {PayoutStatus.PENDING, PayoutStatus.READY, PayoutStatus.APPROVED}
PRIVATE = {
    "approved_by_user_id",
    "declared_paid_by_user_id",
    "external_reference",
    "payment_note",
    "dispute_reason",
    "resolved_by_user_id",
    "resolution_note",
    "cancellation_reason",
}


class PayoutError(CycleError):
    pass


def require_role(membership: Membership, roles: set[MembershipRole]):
    if membership.role not in roles:
        raise PayoutError("Rôle interne insuffisant", 403)


FEE_FIELDS = {"platform_fee", "solidarity_fund_share", "net_amount"}


def read_item(
    item: Payout, membership: Membership, contribution_amount: Decimal | None = None
) -> PayoutRead:
    values = {
        name: getattr(item, name)
        for name in PayoutRead.model_fields
        if name not in FEE_FIELDS
        and (
            name not in PRIVATE
            or membership.role in FINANCIAL
            or membership.id == item.beneficiary_membership_id
        )
    }
    if contribution_amount is not None:
        fees = quote_from_gross(item.expected_amount, contribution_amount)
        values.update(
            platform_fee=fees.fee_total,
            solidarity_fund_share=fees.solidarity_fund_share,
            net_amount=fees.net_amount,
        )
    return PayoutRead.model_validate(values)


async def membership_for(session, tontine_id, actor, *, lock=False):
    membership = await membership_repository.find_membership(
        session, tontine_id, actor.id, active_only=True, lock=lock
    )
    if membership is None:
        raise PayoutError("Versement introuvable ou inaccessible", 404)
    return membership


async def get_payout(
    session: AsyncSession, payout_id: UUID, actor: User, *, lock=False
):
    item = await repositories.find(session, payout_id)
    if item is None:
        raise PayoutError("Versement introuvable", 404)
    # Check access before acquiring the aggregate lock, then reload the role under lock.
    membership = await membership_for(session, item.tontine_id, actor)
    cycle = await get_cycle(session, item.tontine_id, item.cycle_id, lock=lock)
    if lock:
        membership = await membership_for(session, item.tontine_id, actor, lock=True)
        item = await repositories.find(session, payout_id, lock=True)
        if item is None:
            raise PayoutError("Versement introuvable", 404)
    return item, membership, cycle


def required_members(cycle, beneficiary_id):
    ids = {turn.beneficiary_membership_id for turn in cycle.turns}
    return ids if cycle.beneficiary_contributes else ids - {beneficiary_id}


async def audit_payout(
    session: AsyncSession,
    item: Payout,
    event_name: str,
    changes: dict,
    *,
    actor_user_id: UUID | None = None,
) -> None:
    beneficiary = await session.get(Membership, item.beneficiary_membership_id)
    await record(
        session,
        event_name=event_name,
        actor_user_id=actor_user_id,
        subject_user_id=beneficiary.user_id,
        tontine_id=item.tontine_id,
        resource_type="payout",
        resource_id=item.id,
        changes=changes,
        source="api" if actor_user_id else "system",
    )


async def refresh(
    session: AsyncSession,
    item: Payout,
    cycle: Cycle,
    *,
    actor_user_id: UUID | None = None,
    audit_change: bool = True,
) -> bool:
    """Recompute from actual obligations; caller owns tontine/cycle locks."""
    obligations = await repositories.obligations(session, item.turn_id)
    actual = {entry.membership_id for entry in obligations}
    available = sum(
        (
            entry.amount_due
            for entry in obligations
            if entry.status == ContributionStatus.CONFIRMED
        ),
        ZERO,
    )
    expected = sum((entry.amount_due for entry in obligations), ZERO)
    if available > item.expected_amount:
        raise PayoutError("Cotisations incohérentes avec le montant attendu", 409)
    item.available_amount = available
    eligible = (
        cycle.status == CycleStatus.ACTIVE
        and item.scheduled_for <= datetime.now(UTC)
        and actual == required_members(cycle, item.beneficiary_membership_id)
        and expected == item.expected_amount
        and expected > ZERO
        and all(entry.status == ContributionStatus.CONFIRMED for entry in obligations)
    )
    old_status = item.status
    if item.status in {PayoutStatus.PENDING, PayoutStatus.READY}:
        item.status = PayoutStatus.READY if eligible else PayoutStatus.PENDING
    if audit_change and old_status != item.status:
        await audit_payout(
            session,
            item,
            "payout.ready" if item.status == PayoutStatus.READY else "payout.pending",
            {"status": change(old_status, item.status)},
            actor_user_id=actor_user_id,
        )
    return eligible


async def generate_for_cycle(
    session: AsyncSession, cycle: Cycle, *, actor_user_id: UUID | None = None
) -> int:
    """Internal hook: no commit, atomic with activation and contributions."""
    if cycle.status not in {CycleStatus.ACTIVE, CycleStatus.COMPLETED}:
        raise PayoutError("Les versements nécessitent un cycle actif ou terminé", 409)
    existing = {
        item.turn_id for item in await repositories.for_cycle(session, cycle.id)
    }
    tontine = await session.get(Tontine, cycle.tontine_id)
    created = 0
    for turn in cycle.turns:
        if turn.id in existing:
            continue
        entries = await repositories.obligations(session, turn.id)
        if {entry.membership_id for entry in entries} != required_members(
            cycle, turn.beneficiary_membership_id
        ):
            raise PayoutError(
                "Générer toutes les cotisations avant les versements", 409
            )
        item = Payout(
            tontine_id=cycle.tontine_id,
            cycle_id=cycle.id,
            turn_id=turn.id,
            beneficiary_membership_id=turn.beneficiary_membership_id,
            expected_amount=sum((entry.amount_due for entry in entries), ZERO),
            available_amount=ZERO,
            currency=tontine.currency,
            status=PayoutStatus.PENDING,
            scheduled_for=turn.scheduled_for,
        )
        if item.expected_amount > Decimal("9999999999999999.99"):
            raise PayoutError(
                "Le montant du tour dépasse la capacité monétaire du système", 409
            )
        session.add(item)
        await session.flush()
        await refresh(session, item, cycle, audit_change=False)
        await audit_payout(
            session,
            item,
            "payout.generated",
            {
                "status": {"to": item.status.value},
                "expected_amount": {"to": item.expected_amount},
                "currency": {"to": item.currency},
            },
            actor_user_id=actor_user_id,
        )
        created += 1
    await session.flush()
    return created


async def generate(session, tontine_id, cycle_id, actor):
    try:
        await membership_for(session, tontine_id, actor)
        cycle = await get_cycle(session, tontine_id, cycle_id, lock=True)
        membership = await membership_for(session, tontine_id, actor, lock=True)
        require_role(membership, MANAGERS)
        await generate_for_cycle(session, cycle, actor_user_id=actor.id)
        await session.commit()
    except Exception:
        await session.rollback()
        raise


async def refresh_for_turn(session, cycle, turn_id):
    item = await repositories.for_turn(session, turn_id)
    if item is not None:
        await refresh(session, item, cycle)


async def cancel_for_cycle(session, cycle_id):
    for item in await repositories.for_cycle(session, cycle_id):
        if item.status in UNPAID:
            old_status = item.status
            item.status = PayoutStatus.CANCELLED
            item.cancelled_at = datetime.now(UTC)
            item.cancellation_reason = "Cycle annulé"
            await audit_payout(
                session,
                item,
                "payout.cancelled",
                {
                    "status": change(old_status, item.status),
                    "reason": {"to": "cycle_cancelled"},
                },
            )
    await session.flush()


def authorize_action(action: str, item: Payout, membership: Membership):
    if action in {"confirm-receipt", "dispute"}:
        if membership.id != item.beneficiary_membership_id:
            raise PayoutError("Action réservée au bénéficiaire", 403)
    elif action in {"approve", "resolve-dispute"}:
        require_role(membership, MANAGERS)
    elif action == "declare-paid":
        require_role(membership, {MembershipRole.OWNER, MembershipRole.TREASURER})
    elif action == "cancel":
        require_role(membership, {MembershipRole.OWNER})
    elif action == "refresh-readiness":
        # Derived state only: all active members may request this calculation.
        return
    else:
        raise ValueError(f"Unknown payout action: {action}")


async def transition(session, payout_id, actor, action, payload=None):
    try:
        item, membership, cycle = await get_payout(session, payout_id, actor, lock=True)
        authorize_action(action, item, membership)
        now = datetime.now(UTC)
        if action in {"refresh-readiness", "approve", "declare-paid"}:
            eligible = await refresh(session, item, cycle, actor_user_id=actor.id)
        if action == "refresh-readiness":
            pass
        elif action == "approve":
            if item.status != PayoutStatus.READY or not eligible:
                raise PayoutError("Le versement n'est pas prêt", 409)
            if payload.approved_amount != item.expected_amount:
                raise PayoutError(
                    "Le montant doit correspondre au total disponible, sans versement partiel",
                    409,
                )
            item.status = PayoutStatus.APPROVED
            item.approved_amount = payload.approved_amount
            item.approved_at, item.approved_by_user_id = now, actor.id
            await audit_payout(
                session,
                item,
                "payout.approved",
                {
                    "status": change(PayoutStatus.READY, item.status),
                    "approved_amount": {"to": item.approved_amount},
                },
                actor_user_id=actor.id,
            )
        elif action == "declare-paid":
            if item.status != PayoutStatus.APPROVED or not eligible:
                raise PayoutError("Un versement approuvé et éligible est requis", 409)
            item.status = PayoutStatus.DECLARED_PAID
            item.declared_paid_at, item.declared_paid_by_user_id = now, actor.id
            item.external_reference, item.payment_note = (
                payload.external_reference,
                payload.payment_note,
            )
            await audit_payout(
                session,
                item,
                "payout.declared_paid",
                {"status": change(PayoutStatus.APPROVED, item.status)},
                actor_user_id=actor.id,
            )
            beneficiary = await session.get(Membership, item.beneficiary_membership_id)
            beneficiary_user = await session.get(User, beneficiary.user_id)
            tontine = await session.get(Tontine, item.tontine_id)
            await enqueue_event(
                session,
                event_name="payout.declared_paid",
                aggregate_type="payout",
                aggregate_id=item.id,
                tontine_id=item.tontine_id,
                recipients=[recipient(beneficiary_user)],
                template_context={"tontine_name": tontine.name},
                action_path=f"/tontines/{item.tontine_id}/payouts/{item.id}",
                deduplication_key=f"payout:{item.id}:declared_paid",
            )
        elif action == "confirm-receipt":
            if item.status != PayoutStatus.DECLARED_PAID:
                raise PayoutError("Seul un versement déclaré peut être reçu", 409)
            item.status, item.received_at = PayoutStatus.RECEIVED, now
            await audit_payout(
                session,
                item,
                "payout.received",
                {"status": change(PayoutStatus.DECLARED_PAID, item.status)},
                actor_user_id=actor.id,
            )
        elif action == "dispute":
            if item.status != PayoutStatus.DECLARED_PAID:
                raise PayoutError("Seul un versement déclaré peut être contesté", 409)
            item.status = PayoutStatus.DISPUTED
            item.disputed_at, item.dispute_reason = now, payload.reason
            await audit_payout(
                session,
                item,
                "payout.disputed",
                {
                    "status": change(PayoutStatus.DECLARED_PAID, item.status),
                    "reason_provided": {"to": True},
                },
                actor_user_id=actor.id,
            )
            tontine = await session.get(Tontine, item.tontine_id)
            await enqueue_event(
                session,
                event_name="payout.disputed",
                aggregate_type="payout",
                aggregate_id=item.id,
                tontine_id=item.tontine_id,
                recipients=await tontine_recipients(
                    session,
                    item.tontine_id,
                    roles={MembershipRole.OWNER, MembershipRole.MANAGER},
                ),
                template_context={"tontine_name": tontine.name},
                action_path=f"/tontines/{item.tontine_id}/payouts/{item.id}",
                deduplication_key=f"payout:{item.id}:disputed",
            )
        elif action == "resolve-dispute":
            if item.status != PayoutStatus.DISPUTED:
                raise PayoutError("Aucune contestation à résoudre", 409)
            item.status, item.received_at = PayoutStatus.RECEIVED, now
            item.resolved_at, item.resolved_by_user_id = now, actor.id
            item.resolution_note = payload.resolution_note
            await audit_payout(
                session,
                item,
                "payout.dispute_resolved",
                {
                    "status": change(PayoutStatus.DISPUTED, item.status),
                    "resolution_provided": {"to": True},
                },
                actor_user_id=actor.id,
            )
        elif action == "cancel":
            if item.status not in UNPAID:
                raise PayoutError("Un versement effectué ne peut plus être annulé", 409)
            old_status = item.status
            item.status = PayoutStatus.CANCELLED
            item.cancelled_at, item.cancellation_reason = now, payload.reason
            await audit_payout(
                session,
                item,
                "payout.cancelled",
                {
                    "status": change(old_status, item.status),
                    "reason_provided": {"to": True},
                },
                actor_user_id=actor.id,
            )
        await session.commit()
        await session.refresh(item)
        return read_item(item, membership, cycle.contribution_amount)
    except Exception:
        await session.rollback()
        raise


async def summary(session, cycle_id):
    groups = await repositories.aggregate(session, cycle_id)
    counts = {state: 0 for state in PayoutStatus}
    amounts = {state: ZERO for state in PayoutStatus}
    available = ZERO
    for state, count, expected, confirmed in groups:
        counts[state], amounts[state] = count, expected
        if state != PayoutStatus.CANCELLED:
            available += confirmed
    cycle = await session.get(Cycle, cycle_id)
    tontine = await session.get(Tontine, cycle.tontine_id)
    return PayoutSummary(
        cycle_id=cycle_id,
        currency=tontine.currency,
        total=sum(counts.values()),
        expected_amount=sum(amounts.values(), ZERO) - amounts[PayoutStatus.CANCELLED],
        available_amount=available,
        counts=counts,
        **{state.value + "_amount": amounts[state] for state in PayoutStatus},
    )
