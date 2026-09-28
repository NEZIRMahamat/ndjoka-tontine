"""Jeu de données de démonstration Ndjoka.

Crée des profils fictifs, des tontines privées en cours (avec cotisations,
retards, versements reçus), des tontines ouvertes en phase de recrutement
et une tontine terminée, afin de présenter l'application avec des données
réalistes. Le compte réel du présentateur (identifié par son ``auth0_sub``)
est pré-créé et placé au cœur du jeu de données : à sa première connexion,
il retrouve ses tontines, son historique, son score et ses notifications.

Usage :

    uv run python -m app.seed.demo --presenter "auth0|xxxx:Prénom Nom"

Le script refuse de s'exécuter si le jeu de données est déjà présent ; passer
par ``python -m app.seed.reset`` pour repartir d'une base vide.
"""

from __future__ import annotations

import argparse
import asyncio
import calendar
import secrets
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session_factory
from app.modules.audit.services import record
from app.modules.contributions.enums import ContributionStatus
from app.modules.contributions.models import Contribution
from app.modules.cycles.enums import CycleFrequency, CycleStatus
from app.modules.cycles.models import Cycle, CycleTurn
from app.modules.cycles.services import scheduled_datetime
from app.modules.memberships.enums import MembershipRole, MembershipStatus
from app.modules.memberships.models import Membership
from app.modules.notifications.enums import NotificationStatus
from app.modules.notifications.models import Notification
from app.modules.payment_methods.enums import PaymentMethodType
from app.modules.payment_methods.models import PaymentMethod
from app.modules.payouts.enums import PayoutStatus
from app.modules.payouts.models import Payout
from app.modules.profiles.enums import (
    ContributionRhythm,
    ExperienceLevel,
    GroupSizePreference,
    SavingsGoal,
    TurnPreference,
)
from app.modules.profiles.models import SaverProfile
from app.modules.tontines.enums import TontineCategory, TontineStatus, TurnOrderMode
from app.modules.tontines.models import Tontine
from app.modules.users.enums import GlobalRole, UserStatus
from app.modules.users.models import User

DEMO_SUB_PREFIX = "demo|"
DEMO_EMAIL_DOMAIN = "demo.ndjoka-tontine.com"
DEFAULT_PRESENTER = ("auth0|6a9ca06556fde8188d33dfb4", "Nezir A.")
TIMEZONE = "Europe/Paris"

COVER_IMAGES = {
    TontineCategory.BUSINESS: "https://images.unsplash.com/photo-1548782033-3ac3a62ece8d?auto=format&fit=crop&w=1200&q=80",
    TontineCategory.FAMILY: "https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=1200&q=80",
    TontineCategory.TRAVEL: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
    TontineCategory.SOLIDARITY: "https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?auto=format&fit=crop&w=1200&q=80",
    TontineCategory.HOUSING: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1200&q=80",
    TontineCategory.EDUCATION: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1200&q=80",
    TontineCategory.OTHER: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80",
}
PRO_EQUIPMENT_IMAGE = "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80"
SCHOOL_IMAGE = "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1200&q=80"
DUBAI_IMAGE = "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80"


@dataclass(frozen=True)
class Persona:
    slug: str
    name: str
    city: str
    phone: str | None = None


@dataclass
class Presenter:
    auth0_sub: str
    display_name: str | None


# fmt: off
PERSONAS: dict[str, Persona] = {p.slug: p for p in [
    Persona("awa.ndiaye", "Awa Ndiaye", "Paris", "+33612345601"),
    Persona("fatou.sow", "Fatou Sow", "Paris", "+33612345602"),
    Persona("aminata.fall", "Aminata Fall", "Saint-Denis"),
    Persona("rokhaya.diallo", "Rokhaya Diallo", "Montreuil"),
    Persona("ndeye.mbaye", "Ndèye Mbaye", "Paris"),
    Persona("binta.camara", "Binta Camara", "Créteil"),
    Persona("aissatou.ba", "Aïssatou Ba", "Paris"),
    Persona("coumba.sarr", "Coumba Sarr", "Évry"),
    Persona("marieme.thiam", "Marième Thiam", "Paris"),
    Persona("sophie.martin", "Sophie Martin", "Paris", "+33612345610"),
    Persona("claire.bernard", "Claire Bernard", "Paris"),
    Persona("isabelle.morel", "Isabelle Morel", "Boulogne-Billancourt"),
    Persona("nathalie.dupont", "Nathalie Dupont", "Paris"),
    Persona("sandrine.petit", "Sandrine Petit", "Vincennes"),
    Persona("valerie.leroy", "Valérie Leroy", "Paris"),
    Persona("cecile.simon", "Cécile Simon", "Nanterre"),
    Persona("karim.benali", "Karim Benali", "Lyon", "+33612345620"),
    Persona("moussa.traore", "Moussa Traoré", "Lyon"),
    Persona("yanis.amrani", "Yanis Amrani", "Marseille"),
    Persona("hamsatou.dia", "Hamsatou Dia", "Marseille"),
    Persona("lucas.bernard", "Lucas Bernard", "Bordeaux"),
    Persona("ines.kone", "Inès Koné", "Toulouse"),
    Persona("omar.sy", "Omar Sy", "Paris"),
    Persona("leila.haddad", "Leïla Haddad", "Lille"),
    Persona("jean.dupuis", "Jean Dupuis", "Nantes"),
    Persona("nadia.mansour", "Nadia Mansour", "Strasbourg"),
    Persona("mamadou.keita", "Mamadou Keïta", "Paris"),
    Persona("chloe.robert", "Chloé Robert", "Lyon"),
    Persona("adama.coulibaly", "Adama Coulibaly", "Marseille"),
    Persona("sarah.cohen", "Sarah Cohen", "Paris"),
    Persona("ibrahima.ndour", "Ibrahima Ndour", "Toulouse"),
    Persona("emma.garcia", "Emma Garcia", "Bordeaux"),
    Persona("seydou.diarra", "Seydou Diarra", "Paris"),
    Persona("amelie.fontaine", "Amélie Fontaine", "Paris"),
    Persona("paul.nguyen", "Paul Nguyen", "Lyon"),
    Persona("khadija.el-amrani", "Khadija El Amrani", "Paris"),
    Persona("thomas.lefevre", "Thomas Lefèvre", "Paris"),
    Persona("mariam.cisse", "Mariam Cissé", "Marseille"),
    Persona("julien.moreau", "Julien Moreau", "Toulouse"),
    Persona("aminata.diop", "Aminata Diop", "Paris"),
]}
# fmt: on

PRESENTER_KEY = "__presenter__"


@dataclass
class SeedContext:
    session: AsyncSession
    now: datetime
    today: date
    users: dict[str, User] = field(default_factory=dict)
    created: dict[str, int] = field(default_factory=dict)

    def bump(self, key: str, count: int = 1) -> None:
        self.created[key] = self.created.get(key, 0) + count


def months_ago(today: date, count: int, day: int) -> date:
    month_index = today.month - 1 - count
    year = today.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def reference(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(3).upper()}"


async def has_demo_data(session: AsyncSession) -> bool:
    found = await session.scalar(
        select(User.id).where(User.auth0_sub.like(f"{DEMO_SUB_PREFIX}%")).limit(1)
    )
    return found is not None


async def ensure_user(
    ctx: SeedContext,
    key: str,
    *,
    auth0_sub: str,
    name: str | None,
    city: str | None,
    phone: str | None = None,
    email: str | None = None,
) -> User:
    user = await ctx.session.scalar(select(User).where(User.auth0_sub == auth0_sub))
    if user is None:
        user = User(
            auth0_sub=auth0_sub,
            email=email,
            display_name=name,
            city=city,
            phone=phone,
            locale="fr",
            timezone=TIMEZONE,
            status=UserStatus.ACTIVE,
            global_role=GlobalRole.USER,
        )
        ctx.session.add(user)
        await ctx.session.flush()
        ctx.bump("users")
    else:
        if name and not user.display_name:
            user.display_name = name
        if city and not user.city:
            user.city = city
    ctx.users[key] = user
    return user


async def persona(ctx: SeedContext, slug: str) -> User:
    if slug in ctx.users:
        return ctx.users[slug]
    item = PERSONAS[slug]
    return await ensure_user(
        ctx,
        slug,
        auth0_sub=f"{DEMO_SUB_PREFIX}{slug}",
        name=item.name,
        city=item.city,
        phone=item.phone,
        email=f"{slug}@{DEMO_EMAIL_DOMAIN}",
    )


async def add_profile(ctx: SeedContext, user: User, **values) -> None:
    existing = await ctx.session.scalar(
        select(SaverProfile).where(SaverProfile.user_id == user.id)
    )
    if existing is not None:
        return
    ctx.session.add(SaverProfile(user_id=user.id, **values))
    await ctx.session.flush()
    ctx.bump("saver_profiles")


@dataclass
class TontineSpec:
    key: str
    name: str
    description: str
    category: TontineCategory
    city: str
    owner: str
    members: list[str]
    contribution: Decimal
    frequency: CycleFrequency
    max_members: int | None
    order_mode: TurnOrderMode = TurnOrderMode.REGISTRATION
    goal: str | None = None
    rules: str | None = None
    late_penalty: bool = False
    discoverable: bool = False
    min_score: Decimal | None = None
    cover: str | None = None
    treasurer: str | None = None
    manager: str | None = None


async def create_tontine(
    ctx: SeedContext, spec: TontineSpec, *, status: TontineStatus, created_days_ago: int
) -> tuple[Tontine, dict[str, Membership]]:
    owner = ctx.users[spec.owner]
    created_at = ctx.now - timedelta(days=created_days_ago)
    tontine = Tontine(
        name=spec.name,
        description=spec.description,
        currency="EUR",
        max_members=spec.max_members,
        is_discoverable=spec.discoverable,
        min_reliability_score=spec.min_score,
        category=spec.category,
        goal=spec.goal,
        city=spec.city,
        order_mode=spec.order_mode,
        rules=spec.rules,
        late_penalty_enabled=spec.late_penalty,
        cover_image_url=spec.cover or COVER_IMAGES[spec.category],
        status=status,
        created_by_user_id=owner.id,
        created_at=created_at,
        updated_at=created_at,
        archived_at=created_at if status == TontineStatus.ARCHIVED else None,
    )
    ctx.session.add(tontine)
    await ctx.session.flush()
    memberships: dict[str, Membership] = {}
    ordered = [spec.owner, *[m for m in spec.members if m != spec.owner]]
    for index, key in enumerate(ordered):
        user = ctx.users[key]
        role = MembershipRole.MEMBER
        if key == spec.owner:
            role = MembershipRole.OWNER
        elif key == spec.treasurer:
            role = MembershipRole.TREASURER
        elif key == spec.manager:
            role = MembershipRole.MANAGER
        membership = Membership(
            tontine_id=tontine.id,
            user_id=user.id,
            role=role,
            status=MembershipStatus.ACTIVE,
            joined_at=created_at + timedelta(hours=2 * index),
            updated_at=created_at + timedelta(hours=2 * index),
        )
        ctx.session.add(membership)
        memberships[key] = membership
    await ctx.session.flush()
    await record(
        ctx.session,
        event_name="tontine.created",
        actor_user_id=owner.id,
        subject_user_id=owner.id,
        tontine_id=tontine.id,
        resource_type="tontine",
        resource_id=tontine.id,
        changes={
            "name": {"to": tontine.name},
            "currency": {"to": tontine.currency},
            "max_members": {"to": tontine.max_members},
            "status": {"to": "draft"},
            "category": {"to": tontine.category.value},
            "is_discoverable": {"to": tontine.is_discoverable},
            "order_mode": {"to": tontine.order_mode.value},
        },
    )
    ctx.bump("tontines")
    ctx.bump("memberships", len(memberships))
    return tontine, memberships


async def create_cycle(
    ctx: SeedContext,
    tontine: Tontine,
    spec: TontineSpec,
    memberships: dict[str, Membership],
    *,
    start_date: date,
    status: CycleStatus,
    order: list[str] | None = None,
) -> tuple[Cycle, list[CycleTurn]]:
    owner = ctx.users[spec.owner]
    cycle = Cycle(
        tontine_id=tontine.id,
        sequence_number=1,
        name=f"Cycle 1 · {spec.name}"[:120],
        contribution_amount=spec.contribution,
        frequency=spec.frequency,
        start_date=start_date,
        timezone=TIMEZONE,
        beneficiary_contributes=True,
        status=status,
        created_by_user_id=owner.id,
        activated_at=(
            datetime.combine(start_date, datetime.min.time(), UTC) - timedelta(days=2)
            if status in {CycleStatus.ACTIVE, CycleStatus.COMPLETED}
            else None
        ),
        completed_at=(
            ctx.now - timedelta(days=5) if status == CycleStatus.COMPLETED else None
        ),
    )
    ctx.session.add(cycle)
    await ctx.session.flush()
    turns: list[CycleTurn] = []
    if order is not None:
        for position, key in enumerate(order, 1):
            turn = CycleTurn(
                cycle_id=cycle.id,
                position=position,
                beneficiary_membership_id=memberships[key].id,
                scheduled_for=scheduled_datetime(cycle, position),
            )
            ctx.session.add(turn)
            turns.append(turn)
        await ctx.session.flush()
    ctx.bump("cycles")
    ctx.bump("turns", len(turns))
    if status in {CycleStatus.ACTIVE, CycleStatus.COMPLETED}:
        await record(
            ctx.session,
            event_name="cycle.activated",
            actor_user_id=owner.id,
            tontine_id=tontine.id,
            resource_type="cycle",
            resource_id=cycle.id,
            changes={"status": {"from": "scheduled", "to": "active"}},
        )
    return cycle, turns


def contribution_row(
    cycle: Cycle,
    turn: CycleTurn,
    membership: Membership,
    state: str,
    confirmer: User,
    *,
    late_days: int = 0,
) -> Contribution:
    due = turn.scheduled_for
    row = Contribution(
        cycle_id=cycle.id,
        turn_id=turn.id,
        membership_id=membership.id,
        amount_due=cycle.contribution_amount,
        due_at=due,
        status=ContributionStatus.PENDING,
    )
    if state == "confirmed":
        settled = (
            due + timedelta(days=late_days) if late_days else due - timedelta(days=2)
        )
        row.status = ContributionStatus.CONFIRMED
        row.declared_at = settled - timedelta(hours=6)
        row.declaration_reference = reference("VIR")
        row.confirmed_at = settled
        row.confirmed_by_user_id = confirmer.id
    elif state == "declared":
        row.status = ContributionStatus.DECLARED
        row.declared_at = due - timedelta(days=1)
        row.declaration_reference = reference("VIR")
        row.declaration_note = "Virement effectué depuis mon compte courant."
    elif state == "rejected":
        row.status = ContributionStatus.REJECTED
        row.rejected_at = due - timedelta(days=1)
        row.rejected_by_user_id = confirmer.id
        row.rejection_reason = "Référence de virement introuvable, merci de vérifier."
    return row


async def seed_turn(
    ctx: SeedContext,
    tontine: Tontine,
    cycle: Cycle,
    turn: CycleTurn,
    memberships: dict[str, Membership],
    order: list[str],
    states: dict[str, str],
    confirmer: User,
    *,
    payout_state: str,
    late: dict[str, int] | None = None,
) -> None:
    late = late or {}
    available = Decimal("0.00")
    for key in order:
        state = states.get(key, "pending")
        row = contribution_row(
            cycle, turn, memberships[key], state, confirmer, late_days=late.get(key, 0)
        )
        ctx.session.add(row)
        if state == "confirmed":
            available += row.amount_due
    expected = cycle.contribution_amount * len(order)
    payout = Payout(
        tontine_id=tontine.id,
        cycle_id=cycle.id,
        turn_id=turn.id,
        beneficiary_membership_id=turn.beneficiary_membership_id,
        expected_amount=expected,
        available_amount=available,
        currency=tontine.currency,
        status=PayoutStatus.PENDING,
        scheduled_for=turn.scheduled_for,
    )
    if payout_state == "received":
        paid_at = turn.scheduled_for + timedelta(days=1)
        payout.status = PayoutStatus.RECEIVED
        payout.approved_amount = expected
        payout.approved_at = paid_at
        payout.approved_by_user_id = confirmer.id
        payout.declared_paid_at = paid_at + timedelta(hours=3)
        payout.declared_paid_by_user_id = confirmer.id
        payout.external_reference = reference("POT")
        payout.payment_note = "Virement du pot au bénéficiaire du tour."
        payout.received_at = paid_at + timedelta(days=1)
    elif payout_state == "ready":
        payout.status = PayoutStatus.READY
    ctx.session.add(payout)
    await ctx.session.flush()
    ctx.bump("contributions", len(order))
    ctx.bump("payouts")


async def add_notification(
    ctx: SeedContext,
    user: User,
    tontine: Tontine,
    event_name: str,
    payload: dict,
    action_path: str,
    *,
    unread: bool,
    hours_ago: int,
    key: str,
) -> None:
    created_at = ctx.now - timedelta(hours=hours_ago)
    ctx.session.add(
        Notification(
            recipient_user_id=user.id,
            tontine_id=tontine.id,
            event_name=event_name,
            payload=payload,
            action_path=action_path,
            status=NotificationStatus.UNREAD if unread else NotificationStatus.READ,
            read_at=None if unread else created_at + timedelta(hours=1),
            deduplication_key=f"seed:{key}:{user.id}",
            created_at=created_at,
        )
    )
    ctx.bump("notifications")


async def seed_presenters(ctx: SeedContext, presenters: list[Presenter]) -> None:
    for index, presenter in enumerate(presenters):
        await ensure_user(
            ctx,
            PRESENTER_KEY if index == 0 else f"presenter-{index}",
            auth0_sub=presenter.auth0_sub,
            name=presenter.display_name,
            city="Paris" if index == 0 else None,
        )
    main = ctx.users[PRESENTER_KEY]
    await add_profile(
        ctx,
        main,
        monthly_capacity=Decimal("250.00"),
        preferred_rhythm=ContributionRhythm.MONTHLY,
        savings_goal=SavingsGoal.PROJECT,
        horizon_months=12,
        group_size_preference=GroupSizePreference.MEDIUM,
        experience_level=ExperienceLevel.INTERMEDIATE,
        turn_preference=TurnPreference.FLEXIBLE,
    )
    for method_type, label, last4, default in (
        (PaymentMethodType.CARD, "Visa", "4242", True),
        (PaymentMethodType.SEPA, "Compte courant · prélèvement SEPA", "7892", False),
        (PaymentMethodType.MOBILE_MONEY, "Orange Money", "5678", False),
    ):
        ctx.session.add(
            PaymentMethod(
                user_id=main.id,
                type=method_type,
                label=label,
                last4=last4,
                is_default=default,
            )
        )
        ctx.bump("payment_methods")
    await ctx.session.flush()


async def seed_personas(ctx: SeedContext) -> None:
    for slug in PERSONAS:
        await persona(ctx, slug)
    profiles = {
        "awa.ndiaye": dict(
            monthly_capacity=Decimal("150.00"),
            preferred_rhythm=ContributionRhythm.MONTHLY,
            savings_goal=SavingsGoal.EMERGENCY,
            horizon_months=10,
            group_size_preference=GroupSizePreference.MEDIUM,
            experience_level=ExperienceLevel.EXPERIENCED,
            turn_preference=TurnPreference.EARLY,
        ),
        "sophie.martin": dict(
            monthly_capacity=Decimal("600.00"),
            preferred_rhythm=ContributionRhythm.MONTHLY,
            savings_goal=SavingsGoal.BUSINESS,
            horizon_months=12,
            group_size_preference=GroupSizePreference.LARGE,
            experience_level=ExperienceLevel.INTERMEDIATE,
            turn_preference=TurnPreference.FLEXIBLE,
        ),
        "karim.benali": dict(
            monthly_capacity=Decimal("120.00"),
            preferred_rhythm=ContributionRhythm.MONTHLY,
            savings_goal=SavingsGoal.PROJECT,
            horizon_months=6,
            group_size_preference=GroupSizePreference.SMALL,
            experience_level=ExperienceLevel.BEGINNER,
            turn_preference=TurnPreference.LATE,
        ),
    }
    for slug, values in profiles.items():
        await add_profile(ctx, ctx.users[slug], **values)


async def seed_family_tontine(ctx: SeedContext) -> None:
    """Tontine privée en cours : le présentateur est bénéficiaire du tour courant."""
    order = [
        "awa.ndiaye",
        "fatou.sow",
        "aminata.fall",
        PRESENTER_KEY,
        "rokhaya.diallo",
        "ndeye.mbaye",
        "binta.camara",
        "aissatou.ba",
        "coumba.sarr",
        "marieme.thiam",
    ]
    spec = TontineSpec(
        key="family",
        name="Tontine Famille Diop",
        description=(
            "Tontine familiale mensuelle entre cousines et amies proches. Chaque tour "
            "finance un projet personnel : rentrée des enfants, voyage au pays, "
            "petits travaux."
        ),
        category=TontineCategory.FAMILY,
        city="Paris",
        owner="awa.ndiaye",
        treasurer="fatou.sow",
        members=order,
        contribution=Decimal("100.00"),
        frequency=CycleFrequency.MONTHLY,
        max_members=10,
        order_mode=TurnOrderMode.REGISTRATION,
        goal="Financer les projets de chacune, à tour de rôle",
        rules=(
            "Cotisation avant le 5 du mois. Un retard toléré par cycle, prévenir le "
            "groupe. Réunion en visio le premier dimanche du mois."
        ),
        late_penalty=True,
    )
    tontine, memberships = await create_tontine(
        ctx, spec, status=TontineStatus.ACTIVE, created_days_ago=120
    )
    start = months_ago(ctx.today, 3, 5)
    cycle, turns = await create_cycle(
        ctx,
        tontine,
        spec,
        memberships,
        start_date=start,
        status=CycleStatus.ACTIVE,
        order=order,
    )
    treasurer = ctx.users["fatou.sow"]
    all_confirmed = {key: "confirmed" for key in order}
    for turn in turns[:3]:
        late = {"rokhaya.diallo": 4} if turn.position == 2 else {}
        await seed_turn(
            ctx,
            tontine,
            cycle,
            turn,
            memberships,
            order,
            all_confirmed,
            treasurer,
            payout_state="received",
            late=late,
        )
    current_states = {
        "awa.ndiaye": "confirmed",
        "fatou.sow": "confirmed",
        "aminata.fall": "confirmed",
        PRESENTER_KEY: "confirmed",
        "rokhaya.diallo": "confirmed",
        "ndeye.mbaye": "declared",
        "binta.camara": "declared",
        "aissatou.ba": "pending",
        "coumba.sarr": "pending",
        "marieme.thiam": "rejected",
    }
    await seed_turn(
        ctx,
        tontine,
        cycle,
        turns[3],
        memberships,
        order,
        current_states,
        treasurer,
        payout_state="pending",
    )
    for turn in turns[4:]:
        await seed_turn(
            ctx,
            tontine,
            cycle,
            turn,
            memberships,
            order,
            {},
            treasurer,
            payout_state="pending",
        )
    presenter = ctx.users[PRESENTER_KEY]
    await add_notification(
        ctx,
        presenter,
        tontine,
        "contribution.due_soon",
        {
            "tontine_name": tontine.name,
            "amount": "100.00",
            "currency": "EUR",
            "due_at": turns[4].scheduled_for.date().isoformat(),
        },
        f"/tontines/{tontine.id}/cycles/{cycle.id}",
        unread=True,
        hours_ago=5,
        key="family-due",
    )
    await add_notification(
        ctx,
        presenter,
        tontine,
        "cycle.activated",
        {"tontine_name": tontine.name},
        f"/tontines/{tontine.id}/cycles/{cycle.id}",
        unread=False,
        hours_ago=24 * 95,
        key="family-activated",
    )


async def seed_business_tontine(ctx: SeedContext) -> None:
    """Tontine privée dont le présentateur est propriétaire : actions de gestion."""
    order = [
        "sophie.martin",
        "claire.bernard",
        PRESENTER_KEY,
        "isabelle.morel",
        "nathalie.dupont",
        "sandrine.petit",
        "valerie.leroy",
        "cecile.simon",
    ]
    spec = TontineSpec(
        key="business",
        name="Business Femmes Paris",
        description=(
            "Cercle d'entrepreneures parisiennes : chaque tour finance un investissement "
            "professionnel (stock, matériel, formation, communication)."
        ),
        category=TontineCategory.BUSINESS,
        city="Paris",
        owner=PRESENTER_KEY,
        treasurer="claire.bernard",
        members=order,
        contribution=Decimal("200.00"),
        frequency=CycleFrequency.MONTHLY,
        max_members=8,
        order_mode=TurnOrderMode.LOTTERY,
        goal="Investir dans son activité sans crédit",
        rules=(
            "Cotisation avant le 10 du mois. Ordre tiré au sort au lancement. "
            "Justificatif d'usage professionnel apprécié mais non obligatoire."
        ),
        late_penalty=True,
    )
    tontine, memberships = await create_tontine(
        ctx, spec, status=TontineStatus.ACTIVE, created_days_ago=70
    )
    start = months_ago(ctx.today, 1, 10)
    cycle, turns = await create_cycle(
        ctx,
        tontine,
        spec,
        memberships,
        start_date=start,
        status=CycleStatus.ACTIVE,
        order=order,
    )
    presenter = ctx.users[PRESENTER_KEY]
    all_confirmed = {key: "confirmed" for key in order}
    await seed_turn(
        ctx,
        tontine,
        cycle,
        turns[0],
        memberships,
        order,
        all_confirmed,
        presenter,
        payout_state="received",
    )
    current_states = {
        "sophie.martin": "confirmed",
        "claire.bernard": "confirmed",
        PRESENTER_KEY: "confirmed",
        "isabelle.morel": "declared",
        "nathalie.dupont": "declared",
        "sandrine.petit": "pending",
        "valerie.leroy": "pending",
        "cecile.simon": "pending",
    }
    await seed_turn(
        ctx,
        tontine,
        cycle,
        turns[1],
        memberships,
        order,
        current_states,
        presenter,
        payout_state="pending",
    )
    for turn in turns[2:]:
        await seed_turn(
            ctx,
            tontine,
            cycle,
            turn,
            memberships,
            order,
            {},
            presenter,
            payout_state="pending",
        )
    await add_notification(
        ctx,
        presenter,
        tontine,
        "payout.disputed",
        {"tontine_name": tontine.name},
        f"/tontines/{tontine.id}",
        unread=False,
        hours_ago=24 * 20,
        key="business-info",
    )


async def seed_completed_tontine(ctx: SeedContext) -> None:
    """Tontine terminée et archivée : historique et score de fiabilité."""
    order = [
        "omar.sy",
        PRESENTER_KEY,
        "leila.haddad",
        "jean.dupuis",
        "nadia.mansour",
        "mamadou.keita",
    ]
    spec = TontineSpec(
        key="rentree",
        name="Épargne Rentrée 2025",
        description="Six collègues qui ont préparé la rentrée des enfants ensemble.",
        category=TontineCategory.EDUCATION,
        city="Paris",
        owner="omar.sy",
        members=order,
        contribution=Decimal("80.00"),
        frequency=CycleFrequency.MONTHLY,
        max_members=6,
        goal="Fournitures, inscriptions et activités de rentrée",
    )
    tontine, memberships = await create_tontine(
        ctx, spec, status=TontineStatus.ARCHIVED, created_days_ago=260
    )
    start = months_ago(ctx.today, 8, 15)
    cycle, turns = await create_cycle(
        ctx,
        tontine,
        spec,
        memberships,
        start_date=start,
        status=CycleStatus.COMPLETED,
        order=order,
    )
    confirmer = ctx.users["omar.sy"]
    all_confirmed = {key: "confirmed" for key in order}
    for turn in turns:
        await seed_turn(
            ctx,
            tontine,
            cycle,
            turn,
            memberships,
            order,
            all_confirmed,
            confirmer,
            payout_state="received",
        )


async def seed_scheduled_tontine(ctx: SeedContext) -> None:
    """Tontine rejointe récemment par le présentateur, qui démarre dans trois jours."""
    order = [
        "karim.benali",
        "moussa.traore",
        PRESENTER_KEY,
        "chloe.robert",
        "paul.nguyen",
    ]
    spec = TontineSpec(
        key="dubai",
        name="Voyage Dubaï",
        description="Cinq amis qui préparent un séjour à Dubaï pour l'hiver prochain.",
        category=TontineCategory.TRAVEL,
        city="Lyon",
        owner="karim.benali",
        members=order,
        contribution=Decimal("150.00"),
        frequency=CycleFrequency.MONTHLY,
        max_members=5,
        order_mode=TurnOrderMode.LOTTERY,
        goal="Billets d'avion et hébergement",
        cover=DUBAI_IMAGE,
    )
    tontine, memberships = await create_tontine(
        ctx, spec, status=TontineStatus.DRAFT, created_days_ago=12
    )
    await create_cycle(
        ctx,
        tontine,
        spec,
        memberships,
        start_date=ctx.today + timedelta(days=3),
        status=CycleStatus.SCHEDULED,
        order=order,
    )


OPEN_TONTINES: list[TontineSpec] = [
    TontineSpec(
        key="entrepreneures",
        name="Entrepreneures Paris",
        description=(
            "Groupe d'entrepreneures parisiennes souhaitant financer leurs projets "
            "professionnels. Ambiance bienveillante et solidaire, réunions mensuelles "
            "en visio."
        ),
        category=TontineCategory.BUSINESS,
        city="Paris",
        owner="sophie.martin",
        members=[
            "sophie.martin",
            "isabelle.morel",
            "valerie.leroy",
            "sarah.cohen",
            "amelie.fontaine",
            "khadija.el-amrani",
            "emma.garcia",
            "nadia.mansour",
            "chloe.robert",
            "leila.haddad",
            "ines.kone",
            "mariam.cisse",
        ],
        contribution=Decimal("200.00"),
        frequency=CycleFrequency.MONTHLY,
        max_members=15,
        order_mode=TurnOrderMode.LOTTERY,
        goal="Financer un projet professionnel sans crédit",
        rules=(
            "Paiement avant le 5 du mois. Retard toléré une fois par cycle. Ordre de "
            "passage par tirage au sort. Engagement sur toute la durée du cycle."
        ),
        late_penalty=True,
        discoverable=True,
    ),
    TontineSpec(
        key="vacances",
        name="Vacances 2026",
        description=(
            "Tontine voyage pour financer vos prochaines vacances en groupe ou en "
            "famille. Cotisation légère, idéale pour débuter."
        ),
        category=TontineCategory.TRAVEL,
        city="Lyon",
        owner="moussa.traore",
        members=[
            "moussa.traore",
            "paul.nguyen",
            "julien.moreau",
            "emma.garcia",
            "adama.coulibaly",
        ],
        contribution=Decimal("100.00"),
        frequency=CycleFrequency.MONTHLY,
        max_members=10,
        order_mode=TurnOrderMode.REGISTRATION,
        goal="Partir sereinement l'été prochain",
        rules="Cotisation le 1er du mois. Ordre d'inscription. Groupe fermé au démarrage.",
        discoverable=True,
    ),
    TontineSpec(
        key="scolaire",
        name="Soutien Scolaire Familles",
        description=(
            "Réseau de familles pour financer les frais scolaires : fournitures, cours "
            "particuliers, sorties pédagogiques. Cotisation hebdomadaire accessible."
        ),
        category=TontineCategory.FAMILY,
        city="Marseille",
        owner="hamsatou.dia",
        members=[
            "hamsatou.dia",
            "yanis.amrani",
            "adama.coulibaly",
            "mariam.cisse",
            "aminata.diop",
            "seydou.diarra",
            "ibrahima.ndour",
            "thomas.lefevre",
        ],
        contribution=Decimal("50.00"),
        frequency=CycleFrequency.WEEKLY,
        max_members=12,
        order_mode=TurnOrderMode.VOTE,
        goal="Réussite scolaire des enfants du quartier",
        rules="Paiement chaque lundi. Usage réservé aux frais scolaires. Ordre décidé par vote.",
        discoverable=True,
        cover=SCHOOL_IMAGE,
    ),
    TontineSpec(
        key="materiel",
        name="Achat Matériel Pro",
        description=(
            "Tontine pour indépendants souhaitant financer l'achat de matériel ou "
            "d'équipements professionnels. Capital de 10 000 € par tour."
        ),
        category=TontineCategory.BUSINESS,
        city="Paris",
        owner="thomas.lefevre",
        members=[
            "thomas.lefevre",
            "seydou.diarra",
            "julien.moreau",
            "sarah.cohen",
            "omar.sy",
            "jean.dupuis",
            "lucas.bernard",
            "khadija.el-amrani",
            "mamadou.keita",
            "amelie.fontaine",
            "ibrahima.ndour",
            "paul.nguyen",
            "nadia.mansour",
            "chloe.robert",
            "yanis.amrani",
            "leila.haddad",
            "moussa.traore",
            "karim.benali",
        ],
        contribution=Decimal("500.00"),
        frequency=CycleFrequency.MONTHLY,
        max_members=20,
        order_mode=TurnOrderMode.LOTTERY,
        goal="Équiper son activité",
        rules=(
            "Membres au score de fiabilité vérifié uniquement. Paiement avant le 3 du "
            "mois. Tirage au sort le 5. Prélèvement SEPA obligatoire."
        ),
        late_penalty=True,
        discoverable=True,
        min_score=Decimal("0.650"),
        cover=PRO_EQUIPMENT_IMAGE,
    ),
    TontineSpec(
        key="immobilier",
        name="Apport Immobilier",
        description=(
            "Constituer un apport immobilier à plusieurs : 8 membres, 300 € par mois, "
            "2 400 € par tour."
        ),
        category=TontineCategory.HOUSING,
        city="Bordeaux",
        owner="lucas.bernard",
        members=["lucas.bernard", "emma.garcia", "ines.kone"],
        contribution=Decimal("300.00"),
        frequency=CycleFrequency.MONTHLY,
        max_members=8,
        order_mode=TurnOrderMode.REGISTRATION,
        goal="Préparer un achat immobilier",
        rules="Engagement sur 8 mois. Ordre fixé à l'inscription. Vérification d'identité requise.",
        discoverable=True,
        min_score=Decimal("0.450"),
    ),
    TontineSpec(
        key="etudes",
        name="Études Supérieures",
        description=(
            "Parents qui financent ensemble les études supérieures de leurs enfants. "
            "Chaque tour couvre un semestre ou une rentrée."
        ),
        category=TontineCategory.EDUCATION,
        city="Toulouse",
        owner="ines.kone",
        members=[
            "ines.kone",
            "ibrahima.ndour",
            "julien.moreau",
            "aminata.diop",
            "jean.dupuis",
            "sarah.cohen",
        ],
        contribution=Decimal("150.00"),
        frequency=CycleFrequency.MONTHLY,
        max_members=10,
        order_mode=TurnOrderMode.VOTE,
        goal="Frais d'inscription et logement étudiant",
        rules="Paiement avant le 10 du mois. Fonds dédiés aux études. Ordre voté par le groupe.",
        discoverable=True,
    ),
    TontineSpec(
        key="belleville",
        name="Solidarité Quartier Belleville",
        description=(
            "Petite tontine hebdomadaire entre voisins pour les imprévus du quotidien : "
            "réparation, facture, coup dur."
        ),
        category=TontineCategory.SOLIDARITY,
        city="Paris",
        owner="mamadou.keita",
        members=[
            "mamadou.keita",
            "aminata.diop",
            "seydou.diarra",
            "khadija.el-amrani",
            "omar.sy",
            "adama.coulibaly",
            "mariam.cisse",
            "thomas.lefevre",
            "nadia.mansour",
        ],
        contribution=Decimal("30.00"),
        frequency=CycleFrequency.WEEKLY,
        max_members=15,
        order_mode=TurnOrderMode.REGISTRATION,
        goal="Faire face aux imprévus ensemble",
        rules="Cotisation chaque vendredi. Aucun justificatif demandé. Bienveillance exigée.",
        discoverable=True,
    ),
]

OPEN_START_OFFSETS = {
    "entrepreneures": 38,
    "vacances": 34,
    "scolaire": 14,
    "materiel": 36,
    "immobilier": 64,
    "etudes": 43,
    "belleville": 21,
}


async def seed_open_tontines(ctx: SeedContext) -> None:
    for spec in OPEN_TONTINES:
        tontine, memberships = await create_tontine(
            ctx,
            spec,
            status=TontineStatus.DRAFT,
            created_days_ago=20 + 7 * OPEN_TONTINES.index(spec),
        )
        await create_cycle(
            ctx,
            tontine,
            spec,
            memberships,
            start_date=ctx.today + timedelta(days=OPEN_START_OFFSETS[spec.key]),
            status=CycleStatus.DRAFT,
        )


async def seed_demo(
    session: AsyncSession, presenters: list[Presenter]
) -> dict[str, int]:
    if await has_demo_data(session):
        raise RuntimeError(
            "Le jeu de données de démonstration est déjà présent. "
            "Utilisez `python -m app.seed.reset` pour repartir d'une base vide."
        )
    now = datetime.now(UTC)
    ctx = SeedContext(session=session, now=now, today=now.date())
    await seed_presenters(ctx, presenters)
    await seed_personas(ctx)
    await seed_completed_tontine(ctx)
    await seed_family_tontine(ctx)
    await seed_business_tontine(ctx)
    await seed_scheduled_tontine(ctx)
    await seed_open_tontines(ctx)
    await session.commit()
    return ctx.created


def parse_presenter(value: str) -> Presenter:
    auth0_sub, _, name = value.partition(":")
    auth0_sub = auth0_sub.strip()
    if not auth0_sub or "|" not in auth0_sub:
        raise argparse.ArgumentTypeError(
            "Le présentateur doit être de la forme 'auth0|xxxx:Nom affiché'"
        )
    return Presenter(auth0_sub=auth0_sub, display_name=name.strip() or None)


def default_presenters() -> list[Presenter]:
    return [Presenter(*DEFAULT_PRESENTER)]


async def run(presenters: list[Presenter]) -> dict[str, int]:
    async with get_session_factory()() as session:
        return await seed_demo(session, presenters)


def main() -> None:
    parser = argparse.ArgumentParser(description="Charger le jeu de démonstration")
    parser.add_argument(
        "--presenter",
        action="append",
        type=parse_presenter,
        help=(
            "Compte réel (auth0_sub:Nom) placé au cœur du jeu de données ; "
            "répétable, le premier est le compte principal"
        ),
    )
    arguments = parser.parse_args()
    presenters = arguments.presenter or default_presenters()
    created = asyncio.run(run(presenters))
    for key, count in sorted(created.items()):
        print(f"{key:>18} : {count}")
    print(f"Compte principal : {presenters[0].auth0_sub}")


if __name__ == "__main__":
    main()
