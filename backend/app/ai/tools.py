"""Outils exposés à l'agent Ndjoka AI.

Chaque outil interroge exclusivement les données réelles du porteur de
la requête, via les mêmes dépôts/services que le reste de l'API. Aucune
valeur n'est inventée : en cas d'erreur, l'outil répond par un statut
d'erreur explicite plutôt que de faire planter la conversation.

Les paramètres optionnels sont déclarés nullables : le fournisseur valide
strictement les arguments produits par le modèle, qui renvoie souvent ``null``
pour un paramètre omis.
"""

import json
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.contributions.enums import EffectiveContributionStatus
from app.modules.contributions.repositories import (
    list_user_contributions,
    list_user_contributions_with_context,
)
from app.modules.contributions.services import effective_status
from app.modules.cycles.repositories import list_cycles
from app.modules.discovery import services as discovery_services
from app.modules.fees import pricing
from app.modules.memberships.repositories import count_active_members
from app.modules.payouts.enums import PayoutStatus
from app.modules.payouts.repositories import list_items as list_payout_items
from app.modules.profiles import services as profile_services
from app.modules.profiles.reliability import get_reliability
from app.modules.tontines import services as tontine_services
from app.modules.tontines.enums import TontineStatus
from app.modules.users.models import User


def _optional(kind: str, description: str, enum: list[str] | None = None) -> dict:
    schema: dict = {"type": [kind, "null"], "description": description}
    if enum is not None:
        schema["enum"] = [*enum, None]
    return schema


TOOLS_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "list_my_tontines",
            "description": (
                "Lister les tontines réelles de l'utilisateur connecté "
                "(propriétaire ou membre actif), avec statut, catégorie, ville, "
                "devise, capacité et nombre de membres."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": _optional(
                        "string",
                        "Filtrer par statut de tontine (optionnel).",
                        ["draft", "active", "archived"],
                    )
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_tontine_details",
            "description": (
                "Détailler une tontine de l'utilisateur à partir de son nom "
                "(recherche approximative) : règles, cycle en cours, tours, "
                "prochaine échéance et cotisations de l'utilisateur."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Nom ou fragment du nom de la tontine.",
                    }
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_financial_overview",
            "description": (
                "Obtenir un aperçu financier réel et à jour de l'utilisateur : "
                "nombre de tontines actives, cotisations en attente ou en retard, "
                "total déjà cotisé, versements reçus et prochain versement."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_my_contributions",
            "description": (
                "Lister les cotisations réelles de l'utilisateur, triées par "
                "échéance, avec le nom de la tontine."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": _optional(
                        "string",
                        "Filtrer par statut effectif (optionnel).",
                        [
                            "pending",
                            "declared",
                            "confirmed",
                            "rejected",
                            "late",
                            "cancelled",
                        ],
                    )
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_my_payouts",
            "description": (
                "Lister les versements réels dont l'utilisateur est bénéficiaire, "
                "avec le montant net après frais Ndjoka."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": _optional(
                        "string",
                        "Filtrer par statut de versement (optionnel).",
                        [
                            "pending",
                            "ready",
                            "approved",
                            "declared_paid",
                            "received",
                            "disputed",
                            "cancelled",
                        ],
                    )
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_my_saver_profile",
            "description": (
                "Récupérer le profil d'épargne déclaré par l'utilisateur "
                "(capacité mensuelle, rythme, objectif, horizon, taille de "
                "groupe, expérience, préférence de tour) et son score de "
                "fiabilité réel. Indique si le profil reste à compléter."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "recommend_tontines",
            "description": (
                "Proposer les tontines ouvertes qui correspondent le mieux au "
                "profil de l'utilisateur, avec le montant, le rythme, les places "
                "restantes et les raisons concrètes de la correspondance. "
                "N'inclut jamais les tontines qu'il a déjà rejointes."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "search": _optional(
                        "string", "Filtrer par mot-clé sur le nom (optionnel)."
                    ),
                    "limit": _optional(
                        "integer", "Nombre maximum de propositions (1 à 10)."
                    ),
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "simulate_fees",
            "description": (
                "Simuler un tour de tontine avec le barème Ndjoka : pot brut, "
                "frais de service, part versée au fonds de solidarité, montant "
                "net reçu par le bénéficiaire et moyens de paiement autorisés."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "contribution_amount": {
                        "type": "number",
                        "description": "Cotisation par membre et par tour.",
                    },
                    "members": {
                        "type": "integer",
                        "description": "Nombre de membres (cotisations par tour).",
                    },
                },
                "required": ["contribution_amount", "members"],
            },
        },
    },
]


PARIS = ZoneInfo("Europe/Paris")


def _amount(value: Decimal) -> float:
    return float(value)


def _local_date(value: datetime | None) -> str | None:
    """Date calendaire en heure de Paris, sans heure (les échéances sont à minuit)."""
    return value.astimezone(PARIS).date().isoformat() if value else None


async def _list_my_tontines(session: AsyncSession, actor: User, arguments: dict) -> str:
    status_value = arguments.get("status")
    status = TontineStatus(status_value) if status_value else None
    items, total = await tontine_services.list_tontines(
        session, actor, limit=20, offset=0, status=status
    )
    tontines = []
    for item in items:
        tontines.append(
            {
                "id": str(item.id),
                "name": item.name,
                "status": item.status.value,
                "category": item.category.value,
                "city": item.city,
                "currency": item.currency,
                "max_members": item.max_members,
                "member_count": await count_active_members(session, item.id),
                "is_open_to_everyone": item.is_discoverable,
            }
        )
    return json.dumps({"status": "success", "total": total, "tontines": tontines})


async def _get_tontine_details(
    session: AsyncSession, actor: User, arguments: dict
) -> str:
    needle = str(arguments.get("name") or "").strip().casefold()
    items, _ = await tontine_services.list_tontines(session, actor, limit=100, offset=0)
    match = next(
        (item for item in items if needle and needle in item.name.casefold()), None
    )
    if match is None:
        return json.dumps(
            {
                "status": "not_found",
                "message": "Aucune tontine de l'utilisateur ne porte ce nom.",
                "known_names": [item.name for item in items],
            }
        )
    cycles, _ = await list_cycles(session, match.id, limit=10, offset=0)
    reference = next(
        (
            cycle
            for cycle in cycles
            if cycle.status.value in {"active", "scheduled", "draft"}
        ),
        cycles[0] if cycles else None,
    )
    now = datetime.now(UTC)
    contributions, _ = await list_user_contributions_with_context(
        session, actor.id, limit=100, offset=0, status=None, now=now
    )
    mine = [
        {
            "amount_due": _amount(item.amount_due),
            "status": effective_status(item, now).value,
            "due_date": _local_date(item.due_at),
        }
        for item, _, _, tontine_id, _, _ in contributions
        if tontine_id == match.id
    ]
    fees = (
        pricing.quote(reference.contribution_amount, len(reference.turns) or 1)
        if reference
        else None
    )
    details = {
        "status": "success",
        "tontine": {
            "id": str(match.id),
            "name": match.name,
            "status": match.status.value,
            "category": match.category.value,
            "city": match.city,
            "goal": match.goal,
            "order_mode": match.order_mode.value,
            "rules": match.rules,
            "late_penalty_enabled": match.late_penalty_enabled,
            "max_members": match.max_members,
            "member_count": await count_active_members(session, match.id),
            "currency": match.currency,
        },
        "cycle": (
            {
                "status": reference.status.value,
                "contribution_amount": _amount(reference.contribution_amount),
                "frequency": reference.frequency.value,
                "start_date": reference.start_date.isoformat(),
                "turns_total": len(reference.turns),
                "next_turn_date": next(
                    (
                        _local_date(turn.scheduled_for)
                        for turn in reference.turns
                        if turn.scheduled_for >= now
                    ),
                    None,
                ),
                "net_amount_per_turn": _amount(fees.net_amount) if fees else None,
                "fee_per_turn": _amount(fees.fee_total) if fees else None,
            }
            if reference
            else None
        ),
        "my_contributions": mine[:12],
    }
    return json.dumps(details)


async def _get_financial_overview(session: AsyncSession, actor: User) -> str:
    now = datetime.now(UTC)

    tontines, tontines_total = await tontine_services.list_tontines(
        session, actor, limit=100, offset=0
    )
    active_count = sum(1 for item in tontines if item.status == TontineStatus.ACTIVE)

    pending_contributions, pending_total = await list_user_contributions(
        session,
        actor.id,
        limit=50,
        offset=0,
        status=EffectiveContributionStatus.PENDING,
        now=now,
    )
    late_contributions, late_total = await list_user_contributions(
        session,
        actor.id,
        limit=50,
        offset=0,
        status=EffectiveContributionStatus.LATE,
        now=now,
    )
    confirmed_contributions, confirmed_total = await list_user_contributions(
        session,
        actor.id,
        limit=100,
        offset=0,
        status=EffectiveContributionStatus.CONFIRMED,
        now=now,
    )
    pending_amount = sum(_amount(item.amount_due) for item in pending_contributions)
    late_amount = sum(_amount(item.amount_due) for item in late_contributions)
    confirmed_amount = sum(_amount(item.amount_due) for item in confirmed_contributions)
    next_contribution = min(
        pending_contributions, key=lambda item: item.due_at, default=None
    )

    received_payouts, _ = await list_payout_items(
        session, user_id=actor.id, status=PayoutStatus.RECEIVED, limit=50, offset=0
    )
    upcoming_payouts, _ = await list_payout_items(
        session, user_id=actor.id, limit=20, offset=0
    )
    next_payout = next(
        (
            item
            for item in upcoming_payouts
            if item.status
            in {PayoutStatus.PENDING, PayoutStatus.READY, PayoutStatus.APPROVED}
        ),
        None,
    )

    overview = {
        "status": "success",
        "tontines_total": tontines_total,
        "active_tontines": active_count,
        "pending_contributions_count": pending_total,
        "pending_contributions_amount": pending_amount,
        "late_contributions_count": late_total,
        "late_contributions_amount": late_amount,
        "confirmed_contributions_count": confirmed_total,
        "total_saved_amount": confirmed_amount,
        "received_payouts_count": len(received_payouts),
        "received_payouts_amount": sum(
            _amount(item.expected_amount) for item in received_payouts
        ),
        "next_contribution_due_date": _local_date(
            next_contribution.due_at if next_contribution else None
        ),
        "next_contribution_amount": (
            _amount(next_contribution.amount_due) if next_contribution else None
        ),
        "next_payout_status": next_payout.status.value if next_payout else None,
        "next_payout_date": _local_date(
            next_payout.scheduled_for if next_payout else None
        ),
        "next_payout_gross_amount": (
            _amount(next_payout.expected_amount) if next_payout else None
        ),
        "next_payout_currency": next_payout.currency if next_payout else None,
    }
    return json.dumps(overview)


async def _list_my_contributions(
    session: AsyncSession, actor: User, arguments: dict
) -> str:
    status_value = arguments.get("status")
    status = EffectiveContributionStatus(status_value) if status_value else None
    now = datetime.now(UTC)
    rows, total = await list_user_contributions_with_context(
        session,
        actor.id,
        limit=12,
        offset=0,
        status=status,
        now=now,
    )
    contributions = [
        {
            "id": str(item.id),
            "tontine": tontine_name,
            "cycle": cycle_name,
            "amount_due": _amount(item.amount_due),
            "currency": currency,
            "status": effective_status(item, now).value,
            "due_date": _local_date(item.due_at),
            "declared_on": _local_date(item.declared_at),
            "confirmed_on": _local_date(item.confirmed_at),
        }
        for item, cycle_name, _, _, tontine_name, currency in rows
    ]
    return json.dumps(
        {"status": "success", "total": total, "contributions": contributions}
    )


async def _list_my_payouts(session: AsyncSession, actor: User, arguments: dict) -> str:
    status_value = arguments.get("status")
    status = PayoutStatus(status_value) if status_value else None
    items, total = await list_payout_items(
        session, user_id=actor.id, status=status, limit=10, offset=0
    )
    from app.modules.cycles.models import Cycle

    payouts = []
    for item in items:
        cycle = await session.get(Cycle, item.cycle_id)
        fees = (
            pricing.quote_from_gross(item.expected_amount, cycle.contribution_amount)
            if cycle
            else None
        )
        payouts.append(
            {
                "id": str(item.id),
                "status": item.status.value,
                "gross_amount": _amount(item.expected_amount),
                "platform_fee": _amount(fees.fee_total) if fees else None,
                "net_amount": _amount(fees.net_amount) if fees else None,
                "currency": item.currency,
                "scheduled_date": _local_date(item.scheduled_for),
            }
        )
    return json.dumps({"status": "success", "total": total, "payouts": payouts})


async def _get_my_saver_profile(session: AsyncSession, actor: User) -> str:
    profile = await profile_services.get_profile(session, actor)
    reliability = await get_reliability(session, actor.id)
    payload = {
        "status": "success",
        "has_profile": profile is not None,
        "reliability": {
            "score": float(reliability.score),
            "score_on_100": round(float(reliability.score) * 100),
            "band": reliability.band,
            "is_provisional": reliability.is_provisional,
            "contributions_total": reliability.contributions_total,
            "contributions_on_time": reliability.contributions_on_time,
            "contributions_late": reliability.contributions_late,
            "contributions_outstanding": reliability.contributions_outstanding,
            "cycles_completed": reliability.cycles_completed,
            "explanation": reliability.explanation,
        },
    }
    if profile is not None:
        payload["profile"] = {
            "monthly_capacity": _amount(profile.monthly_capacity),
            "preferred_rhythm": profile.preferred_rhythm.value,
            "savings_goal": profile.savings_goal.value,
            "horizon_months": profile.horizon_months,
            "group_size_preference": profile.group_size_preference.value,
            "experience_level": profile.experience_level.value,
            "turn_preference": profile.turn_preference.value,
        }
    return json.dumps(payload)


def _recommendation_card(item) -> dict:
    return {
        "id": str(item.id),
        "name": item.name,
        "description": item.description,
        "category": item.category.value,
        "city": item.city,
        "currency": item.currency,
        "contribution_amount": (
            _amount(item.contribution_amount)
            if item.contribution_amount is not None
            else None
        ),
        "frequency": item.frequency.value if item.frequency else None,
        "monthly_equivalent": (
            _amount(item.monthly_equivalent)
            if item.monthly_equivalent is not None
            else None
        ),
        "seats_left": item.seats_left,
        "member_count": item.member_count,
        "max_members": item.max_members,
        "affinity_score": float(item.affinity_score),
        "is_eligible": item.is_eligible,
        "ineligibility_reason": item.ineligibility_reason,
        "reasons": [reason.label for reason in item.reasons if reason.matched],
        "cover_image_url": item.cover_image_url,
    }


async def _recommend_tontines(
    session: AsyncSession, actor: User, arguments: dict
) -> tuple[str, list[dict]]:
    raw_limit = arguments.get("limit")
    limit = raw_limit if isinstance(raw_limit, int) else 5
    search = arguments.get("search")
    result = await discovery_services.discover_tontines(
        session,
        actor,
        search=search if isinstance(search, str) and search.strip() else None,
        limit=max(1, min(limit, 10)),
        offset=0,
    )
    cards = [_recommendation_card(item) for item in result.items]
    return (
        json.dumps(
            {
                "status": "success",
                "has_profile": result.has_profile,
                "total": result.total,
                "recommendations": cards,
            }
        ),
        cards,
    )


def _simulate_fees(arguments: dict) -> str:
    try:
        amount = Decimal(str(arguments.get("contribution_amount")))
        members = int(arguments.get("members"))
    except (InvalidOperation, TypeError, ValueError):
        return json.dumps(
            {"status": "error", "message": "Montant ou nombre de membres invalide."}
        )
    if amount <= 0 or members < 1:
        return json.dumps(
            {"status": "error", "message": "Montant ou nombre de membres invalide."}
        )
    quote = pricing.quote(amount, members)
    return json.dumps(
        {
            "status": "success",
            "contribution_amount": _amount(quote.contribution_amount),
            "members": quote.members,
            "gross_amount": _amount(quote.gross_amount),
            "fee_per_contribution": _amount(quote.fee_per_contribution),
            "fee_total": _amount(quote.fee_total),
            "effective_rate_percent": float(quote.effective_rate * 100),
            "solidarity_fund_share": _amount(quote.solidarity_fund_share),
            "net_amount_for_beneficiary": _amount(quote.net_amount),
            "payment_methods": quote.payment_methods,
            "note": (
                "Les frais totaux sont déduits du pot versé au bénéficiaire ; chaque "
                "membre verse exactement sa cotisation. La part du fonds de "
                "solidarité est incluse dans les frais totaux (un sixième), elle ne "
                "s'y ajoute pas."
            ),
        }
    )


class ToolResult:
    """Résultat brut d'un outil et éventuelles cartes de recommandation."""

    __slots__ = ("content", "recommendations")

    def __init__(self, content: str, recommendations: list[dict] | None = None):
        self.content = content
        self.recommendations = recommendations or []


async def execute_tool(
    session: AsyncSession, actor: User, tool_name: str, arguments: dict
) -> ToolResult:
    """Exécuter un outil de manière sécurisée : jamais d'exception propagée."""
    try:
        if tool_name == "list_my_tontines":
            return ToolResult(await _list_my_tontines(session, actor, arguments))
        if tool_name == "get_tontine_details":
            return ToolResult(await _get_tontine_details(session, actor, arguments))
        if tool_name == "get_financial_overview":
            return ToolResult(await _get_financial_overview(session, actor))
        if tool_name == "list_my_contributions":
            return ToolResult(await _list_my_contributions(session, actor, arguments))
        if tool_name == "list_my_payouts":
            return ToolResult(await _list_my_payouts(session, actor, arguments))
        if tool_name == "get_my_saver_profile":
            return ToolResult(await _get_my_saver_profile(session, actor))
        if tool_name == "recommend_tontines":
            content, cards = await _recommend_tontines(session, actor, arguments)
            return ToolResult(content, cards)
        if tool_name == "simulate_fees":
            return ToolResult(_simulate_fees(arguments))
        return ToolResult(
            json.dumps({"status": "error", "message": f"Outil inconnu : {tool_name}"})
        )
    except Exception:
        return ToolResult(
            json.dumps(
                {"status": "error", "message": "Donnée momentanément indisponible."}
            )
        )
