"""Outils exposés à l'agent Ndjoka AI.

Chaque outil interroge exclusivement les données réelles du porteur de
la requête, via les mêmes dépôts/services que le reste de l'API. Aucune
valeur n'est inventée : en cas d'erreur, l'outil répond par un statut
d'erreur explicite plutôt que de faire planter la conversation.
"""

import json
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.contributions.enums import EffectiveContributionStatus
from app.modules.contributions.repositories import list_user_contributions
from app.modules.discovery import services as discovery_services
from app.modules.payouts.enums import PayoutStatus
from app.modules.payouts.repositories import list_items as list_payout_items
from app.modules.profiles import services as profile_services
from app.modules.profiles.reliability import get_reliability
from app.modules.tontines import services as tontine_services
from app.modules.tontines.enums import TontineStatus
from app.modules.users.models import User

TOOLS_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "list_my_tontines",
            "description": (
                "Lister les tontines réelles de l'utilisateur connecté "
                "(propriétaire ou membre actif), avec statut, devise et capacité."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["draft", "active", "archived"],
                        "description": "Filtrer par statut de tontine (optionnel).",
                    }
                },
                "required": [],
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
                "et prochain versement disponible."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_my_contributions",
            "description": (
                "Lister les cotisations réelles de l'utilisateur, triées par échéance."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": [
                            "pending",
                            "declared",
                            "confirmed",
                            "rejected",
                            "late",
                            "cancelled",
                        ],
                        "description": "Filtrer par statut effectif (optionnel).",
                    }
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
                "Lister les versements réels dont l'utilisateur est bénéficiaire."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": [
                            "pending",
                            "ready",
                            "approved",
                            "declared_paid",
                            "received",
                            "disputed",
                            "cancelled",
                        ],
                        "description": "Filtrer par statut de versement (optionnel).",
                    }
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
                    "search": {
                        "type": "string",
                        "description": "Filtrer par mot-clé sur le nom (optionnel).",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Nombre maximum de propositions (1 à 10).",
                    },
                },
                "required": [],
            },
        },
    },
]


def _amount(value: Decimal) -> float:
    return float(value)


async def _list_my_tontines(
    session: AsyncSession, actor: User, arguments: dict
) -> str:
    status_value = arguments.get("status")
    status = TontineStatus(status_value) if status_value else None
    items, total = await tontine_services.list_tontines(
        session, actor, limit=10, offset=0, status=status
    )
    tontines = [
        {
            "id": str(item.id),
            "name": item.name,
            "status": item.status.value,
            "currency": item.currency,
            "max_members": item.max_members,
        }
        for item in items
    ]
    return json.dumps({"status": "success", "total": total, "tontines": tontines})


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
    pending_amount = sum(_amount(item.amount_due) for item in pending_contributions)
    late_amount = sum(_amount(item.amount_due) for item in late_contributions)
    next_contribution = min(
        pending_contributions, key=lambda item: item.due_at, default=None
    )

    ready_payouts, _ = await list_payout_items(
        session, user_id=actor.id, status=PayoutStatus.READY, limit=5, offset=0
    )
    next_payout = ready_payouts[0] if ready_payouts else None

    overview = {
        "status": "success",
        "tontines_total": tontines_total,
        "active_tontines": active_count,
        "pending_contributions_count": pending_total,
        "pending_contributions_amount": pending_amount,
        "late_contributions_count": late_total,
        "late_contributions_amount": late_amount,
        "next_contribution_due_at": (
            next_contribution.due_at.isoformat() if next_contribution else None
        ),
        "next_payout_ready": next_payout is not None,
        "next_payout_expected_amount": (
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
    items, total = await list_user_contributions(
        session,
        actor.id,
        limit=10,
        offset=0,
        status=status,
        now=datetime.now(UTC),
    )
    contributions = [
        {
            "id": str(item.id),
            "amount_due": _amount(item.amount_due),
            "status": item.status.value,
            "due_at": item.due_at.isoformat(),
        }
        for item in items
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
    payouts = [
        {
            "id": str(item.id),
            "status": item.status.value,
            "expected_amount": _amount(item.expected_amount),
            "currency": item.currency,
            "scheduled_for": item.scheduled_for.isoformat(),
        }
        for item in items
    ]
    return json.dumps({"status": "success", "total": total, "payouts": payouts})


async def _get_my_saver_profile(session: AsyncSession, actor: User) -> str:
    profile = await profile_services.get_profile(session, actor)
    reliability = await get_reliability(session, actor.id)
    payload = {
        "status": "success",
        "has_profile": profile is not None,
        "reliability": {
            "score": float(reliability.score),
            "band": reliability.band,
            "is_provisional": reliability.is_provisional,
            "contributions_total": reliability.contributions_total,
            "contributions_on_time": reliability.contributions_on_time,
            "contributions_late": reliability.contributions_late,
            "contributions_outstanding": reliability.contributions_outstanding,
            "cycles_completed": reliability.cycles_completed,
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


async def _recommend_tontines(
    session: AsyncSession, actor: User, arguments: dict
) -> str:
    raw_limit = arguments.get("limit")
    limit = raw_limit if isinstance(raw_limit, int) else 5
    search = arguments.get("search")
    result = await discovery_services.discover_tontines(
        session,
        actor,
        search=search if isinstance(search, str) else None,
        limit=max(1, min(limit, 10)),
        offset=0,
    )
    recommendations = [
        {
            "id": str(item.id),
            "name": item.name,
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
            "match_score": float(item.affinity_score),
            "is_eligible": item.is_eligible,
            "reasons": [reason.label for reason in item.reasons if reason.matched],
        }
        for item in result.items
    ]
    return json.dumps(
        {
            "status": "success",
            "has_profile": result.has_profile,
            "total": result.total,
            "recommendations": recommendations,
        }
    )


async def execute_tool(
    session: AsyncSession, actor: User, tool_name: str, arguments: dict
) -> str:
    """Exécuter un outil de manière sécurisée : jamais d'exception propagée."""
    try:
        if tool_name == "list_my_tontines":
            return await _list_my_tontines(session, actor, arguments)
        if tool_name == "get_financial_overview":
            return await _get_financial_overview(session, actor)
        if tool_name == "list_my_contributions":
            return await _list_my_contributions(session, actor, arguments)
        if tool_name == "list_my_payouts":
            return await _list_my_payouts(session, actor, arguments)
        if tool_name == "get_my_saver_profile":
            return await _get_my_saver_profile(session, actor)
        if tool_name == "recommend_tontines":
            return await _recommend_tontines(session, actor, arguments)
        return json.dumps(
            {"status": "error", "message": f"Outil inconnu : {tool_name}"}
        )
    except Exception:
        return json.dumps(
            {"status": "error", "message": "Donnée momentanément indisponible."}
        )
