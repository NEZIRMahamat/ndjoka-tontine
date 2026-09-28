"""Score de fiabilité prédictif (étape 2 de la trajectoire Data).

Le score historique (``reliability.py``) applique des poids fixés à la main.
Ce module utilise une régression logistique entraînée dans
``data-science/ndjoka_ia_fiabilite.ipynb`` : elle estime la probabilité qu'une
cotisation soit réglée en retard ou reste impayée, à partir de l'historique
réel ET du profil d'épargnant.

Les coefficients sont exportés en JSON et appliqués en Python pur : aucune
dépendance de machine learning n'est ajoutée au backend, et chaque prédiction
reste explicable facteur par facteur.
"""

import json
import math
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.profiles import repositories, services
from app.modules.profiles.reliability import band_of
from app.modules.users.models import User

MODEL_PATH = Path(__file__).parent / "ml" / "reliability_model.json"
WEEKS_PER_MONTH = 4.333
RISKY_MONTHS = (9, 12)

# Les variables techniques sont regroupées en facteurs lisibles par l'utilisateur.
FACTOR_GROUPS = {
    "history": (
        "Historique de cotisations",
        ("hist_n", "hist_late", "hist_unpaid", "has_history", "on_time_rate"),
    ),
    "effort": (
        "Poids de la cotisation dans votre budget",
        ("effort_ratio_c", "effort_excess"),
    ),
    "experience": ("Expérience de la tontine", ("experience_level",)),
    "calendar": ("Mois à forte dépense (rentrée, fêtes)", ("risky_month",)),
    "goal": ("Objectif d'épargne", ("savings_goal",)),
    "horizon": ("Horizon d'épargne", ("horizon_months",)),
    "rhythm": ("Rythme et fréquence", ("frequency", "preferred_rhythm")),
    "turn": ("Préférence de tour", ("turn_preference",)),
}


class RiskFactor(BaseModel):
    factor: str
    label: str
    impact: Decimal


class ReliabilityPredictionRead(BaseModel):
    """Score prédit par le modèle, avec les facteurs qui l'expliquent."""

    score: Decimal
    band: str
    late_probability: Decimal
    profile_completed: bool
    effort_ratio: Decimal | None
    increasing_risk: list[RiskFactor]
    decreasing_risk: list[RiskFactor]
    model_name: str
    model_version: str
    trained_on: str
    explanation: str


@dataclass(frozen=True)
class Prediction:
    probability: float
    contributions: dict[str, float]


@lru_cache(maxsize=1)
def load_model() -> dict[str, Any]:
    with MODEL_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def predict(
    features: dict[str, Any], model: dict[str, Any] | None = None
) -> Prediction:
    """Appliquer la régression logistique.

    Une variable absente est remplacée par sa valeur de référence : moyenne
    d'entraînement pour une variable numérique, première modalité pour une
    variable catégorielle. Son impact vaut alors zéro.
    """
    model = model or load_model()
    contributions: dict[str, float] = {}
    for name, spec in model["features"]["numeric"].items():
        value = features.get(name)
        if value is None:
            contributions[name] = 0.0
            continue
        standardized = (float(value) - spec["mean"]) / spec["scale"]
        contributions[name] = spec["weight"] * standardized
    for name, table in model["features"]["categorical"].items():
        contributions[name] = float(table.get(features.get(name), 0.0))
    logit = model["intercept"] + sum(contributions.values())
    return Prediction(1 / (1 + math.exp(-logit)), contributions)


def _enum_value(value: Any) -> Any:
    return getattr(value, "value", value)


def build_features(
    facts: repositories.ReliabilityFacts,
    profile: Any | None,
    *,
    contribution_amount: Decimal | None,
    frequency: str,
    moment: datetime,
    model: dict[str, Any],
) -> tuple[dict[str, Any], float | None]:
    """Construire les variables du modèle à partir des données Ndjoka."""
    total = facts.contributions_total
    features: dict[str, Any] = {
        "hist_n": total,
        "hist_late": facts.contributions_late,
        "hist_unpaid": facts.contributions_outstanding,
        "has_history": 1 if total else 0,
        "on_time_rate": facts.contributions_on_time / total if total else 0.0,
        "already_received": 0,
        "risky_month": 1 if moment.month in RISKY_MONTHS else 0,
        "frequency": frequency,
    }
    effort: float | None = None
    if profile is not None:
        capacity = float(profile.monthly_capacity)
        if contribution_amount is None:
            monthly = capacity * model["effort_threshold"]
        elif frequency == "weekly":
            monthly = float(contribution_amount) * WEEKS_PER_MONTH
        else:
            monthly = float(contribution_amount)
        effort = min(monthly / capacity, model["effort_cap"]) if capacity > 0 else None
        features.update(
            effort_ratio_c=effort,
            effort_excess=(
                max(effort - model["effort_threshold"], 0.0)
                if effort is not None
                else None
            ),
            horizon_months=profile.horizon_months,
            experience_level=_enum_value(profile.experience_level),
            savings_goal=_enum_value(profile.savings_goal),
            preferred_rhythm=_enum_value(profile.preferred_rhythm),
            turn_preference=_enum_value(profile.turn_preference),
        )
    return features, effort


def _quantize(value: float) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _factors(contributions: dict[str, float], *, positive: bool) -> list[RiskFactor]:
    grouped = [
        (key, label, sum(contributions.get(name, 0.0) for name in names))
        for key, (label, names) in FACTOR_GROUPS.items()
    ]
    selected = [
        item for item in grouped if (item[2] > 0.05 if positive else item[2] < -0.05)
    ]
    selected.sort(key=lambda item: abs(item[2]), reverse=True)
    return [
        RiskFactor(factor=key, label=label, impact=_quantize(impact))
        for key, label, impact in selected[:3]
    ]


def _explain(
    probability: float, profile_completed: bool, increasing: list[RiskFactor]
) -> str:
    percent = round(probability * 100)
    text = f"Probabilité estimée de retard ou d'impayé : {percent} %."
    if increasing:
        text += f" Principal facteur de risque : {increasing[0].label.lower()}."
    if not profile_completed:
        text += " Complétez votre profil d'épargnant pour une estimation plus précise."
    return text


async def get_predicted_reliability(
    session: AsyncSession,
    actor: User,
    *,
    contribution_amount: Decimal | None = None,
    frequency: Literal["weekly", "monthly"] = "monthly",
    now: datetime | None = None,
) -> ReliabilityPredictionRead:
    """Prédire la fiabilité de l'utilisateur pour une cotisation donnée."""
    moment = now or datetime.now(UTC)
    model = load_model()
    facts = await repositories.collect_reliability_facts(session, actor.id, moment)
    profile = await services.get_profile(session, actor)
    features, effort = build_features(
        facts,
        profile,
        contribution_amount=contribution_amount,
        frequency=frequency,
        moment=moment,
        model=model,
    )
    prediction = predict(features, model)
    score = _quantize(1 - prediction.probability)
    increasing = _factors(prediction.contributions, positive=True)
    return ReliabilityPredictionRead(
        score=score,
        band=band_of(score),
        late_probability=_quantize(prediction.probability),
        profile_completed=profile is not None,
        effort_ratio=_quantize(effort) if effort is not None else None,
        increasing_risk=increasing,
        decreasing_risk=_factors(prediction.contributions, positive=False),
        model_name=model["name"],
        model_version=model["version"],
        trained_on=model["trained_on"],
        explanation=_explain(prediction.probability, profile is not None, increasing),
    )
