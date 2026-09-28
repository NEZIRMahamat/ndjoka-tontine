from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.services import record
from app.modules.cycles.enums import CycleFrequency
from app.modules.cycles.models import Cycle
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
from app.modules.profiles.models import SaverProfile
from app.modules.profiles.reliability import get_reliability
from app.modules.tontines.enums import TontineStatus
from app.modules.tontines.models import Tontine
from app.modules.users.models import User


async def discover_tontines(
    session: AsyncSession,
    actor: User,
    *,
    search: str | None = None,
    frequency: CycleFrequency | None = None,
    limit: int = 20,
    offset: int = 0,
    eligible_only: bool = False,
) -> DiscoveryList:
    """Classer les tontines ouvertes par affinité avec le profil de l'épargnant."""
    profile = await profile_services.get_profile(session, actor)
    reliability = await get_reliability(session, actor.id)
    rows = await repositories.list_discoverable_tontines(
        session, actor.id, search=search, frequency=frequency
    )

    items = [
        _discovered(tontine, member_count, cycle, owner, profile, reliability.score)
        for tontine, member_count, cycle, owner in rows
    ]

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


async def get_discoverable_tontine(
    session: AsyncSession, actor: User, tontine_id: UUID
) -> DiscoveredTontine:
    row = await repositories.get_discoverable_tontine(session, actor.id, tontine_id)
    if row is None:
        raise MembershipError("Tontine introuvable ou non ouverte", 404)
    profile = await profile_services.get_profile(session, actor)
    reliability = await get_reliability(session, actor.id)
    return _discovered(*row, profile, reliability.score)


def _discovered(
    tontine: Tontine,
    member_count: int,
    cycle: Cycle | None,
    owner: User | None,
    profile: SaverProfile | None,
    reliability_score: Decimal,
) -> DiscoveredTontine:
    facts = TontineFacts(
        contribution_amount=cycle.contribution_amount if cycle else None,
        frequency=cycle.frequency if cycle else None,
        max_members=tontine.max_members,
        member_count=member_count,
    )
    affinity, reasons = score_affinity(profile, facts)
    gate = tontine.min_reliability_score
    eligible = gate is None or reliability_score >= gate
    return DiscoveredTontine(
        id=tontine.id,
        name=tontine.name,
        description=tontine.description,
        currency=tontine.currency,
        max_members=tontine.max_members,
        member_count=member_count,
        seats_left=tontine.max_members - member_count
        if tontine.max_members is not None
        else None,
        contribution_amount=facts.contribution_amount,
        frequency=facts.frequency,
        monthly_equivalent=monthly_equivalent(
            facts.contribution_amount, facts.frequency
        ),
        min_reliability_score=gate,
        created_at=tontine.created_at,
        status=tontine.status,
        category=tontine.category,
        goal=tontine.goal,
        city=tontine.city,
        order_mode=tontine.order_mode,
        rules=tontine.rules,
        late_penalty_enabled=tontine.late_penalty_enabled,
        cover_image_url=tontine.cover_image_url,
        cycle_status=cycle.status if cycle else None,
        start_date=cycle.start_date if cycle else None,
        organizer_name=owner.display_name if owner else None,
        organizer_since=owner.created_at if owner else None,
        affinity_score=affinity,
        is_eligible=eligible,
        ineligibility_reason=None
        if eligible
        else "Cette tontine demande un score de fiabilité plus élevé",
        reasons=reasons,
    )


async def join_discoverable_tontine(
    session: AsyncSession, actor: User, tontine_id: UUID
) -> Membership:
    """Rejoindre directement une tontine ouverte dont on satisfait les conditions."""
    try:
        tontine = await membership_repositories.lock_tontine(session, tontine_id)
        if tontine is None or not tontine.is_discoverable:
            raise MembershipError("Tontine introuvable ou non ouverte", 404)
        if tontine.status not in {TontineStatus.DRAFT, TontineStatus.ACTIVE}:
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
