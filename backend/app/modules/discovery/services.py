from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.services import record
from app.modules.discovery import repositories
from app.modules.discovery.matching import (
    TontineFacts,
    monthly_equivalent,
    score_affinity,
)
from app.modules.discovery.schemas import DiscoveredTontine, DiscoveryList
from app.modules.memberships import repositories as membership_repositories
from app.modules.memberships.enums import MembershipRole, MembershipStatus
from app.modules.memberships.models import Membership
from app.modules.memberships.services import MembershipError
from app.modules.profiles import services as profile_services
from app.modules.profiles.reliability import get_reliability
from app.modules.tontines.enums import TontineStatus
from app.modules.users.models import User


async def discover_tontines(
    session: AsyncSession,
    actor: User,
    *,
    search: str | None = None,
    limit: int = 20,
    offset: int = 0,
    eligible_only: bool = False,
) -> DiscoveryList:
    """Classer les tontines ouvertes par affinité avec le profil de l'épargnant."""
    profile = await profile_services.get_profile(session, actor)
    reliability = await get_reliability(session, actor.id)
    rows = await repositories.list_discoverable_tontines(
        session, actor.id, search=search
    )

    items: list[DiscoveredTontine] = []
    for tontine, member_count, cycle in rows:
        facts = TontineFacts(
            contribution_amount=cycle.contribution_amount if cycle else None,
            frequency=cycle.frequency if cycle else None,
            max_members=tontine.max_members,
            member_count=member_count,
        )
        affinity, reasons = score_affinity(profile, facts)
        gate = tontine.min_reliability_score
        eligible = gate is None or reliability.score >= gate
        items.append(
            DiscoveredTontine(
                id=tontine.id,
                name=tontine.name,
                description=tontine.description,
                currency=tontine.currency,
                max_members=tontine.max_members,
                member_count=member_count,
                seats_left=(
                    tontine.max_members - member_count
                    if tontine.max_members is not None
                    else None
                ),
                contribution_amount=facts.contribution_amount,
                frequency=facts.frequency,
                monthly_equivalent=monthly_equivalent(
                    facts.contribution_amount, facts.frequency
                ),
                min_reliability_score=gate,
                created_at=tontine.created_at,
                affinity_score=affinity,
                is_eligible=eligible,
                ineligibility_reason=(
                    None
                    if eligible
                    else "Cette tontine demande un score de fiabilité plus élevé"
                ),
                reasons=reasons,
            )
        )

    if eligible_only:
        items = [item for item in items if item.is_eligible]

    items.sort(key=lambda item: (item.is_eligible, item.affinity_score), reverse=True)
    total = len(items)
    window = items[offset : offset + limit]
    return DiscoveryList(
        items=window,
        total=total,
        limit=limit,
        offset=offset,
        has_profile=profile is not None,
        reliability_score=Decimal(reliability.score),
    )


async def join_discoverable_tontine(
    session: AsyncSession, actor: User, tontine_id: UUID
) -> Membership:
    """Rejoindre directement une tontine ouverte dont on satisfait les conditions."""
    try:
        tontine = await membership_repositories.lock_tontine(session, tontine_id)
        if tontine is None or not tontine.is_discoverable:
            raise MembershipError("Tontine introuvable ou non ouverte", 404)
        if tontine.status != TontineStatus.ACTIVE:
            raise MembershipError("Cette tontine n'accepte pas d'adhésion", 409)
        if await membership_repositories.find_membership(
            session, tontine.id, actor.id, lock=True
        ):
            raise MembershipError("Vous êtes déjà membre de cette tontine", 409)

        active_count = await membership_repositories.count_active_members(
            session, tontine.id
        )
        if tontine.max_members is not None and active_count >= tontine.max_members:
            raise MembershipError("La capacité maximale est atteinte", 409)

        if tontine.min_reliability_score is not None:
            reliability = await get_reliability(session, actor.id)
            if reliability.score < tontine.min_reliability_score:
                raise MembershipError(
                    "Cette tontine demande un score de fiabilité plus élevé", 403
                )

        membership = Membership(
            tontine_id=tontine.id,
            user_id=actor.id,
            role=MembershipRole.MEMBER,
            status=MembershipStatus.ACTIVE,
        )
        await membership_repositories.insert_membership(session, membership)
        await record(
            session,
            event_name="membership.joined_open_tontine",
            actor_user_id=actor.id,
            subject_user_id=actor.id,
            tontine_id=tontine.id,
            resource_type="membership",
            resource_id=membership.id,
            changes={"role": {"to": membership.role.value}},
        )
        await session.commit()
        await session.refresh(membership)
        return membership
    except MembershipError:
        if session.in_transaction():
            await session.rollback()
        raise
    except Exception:
        await session.rollback()
        raise
