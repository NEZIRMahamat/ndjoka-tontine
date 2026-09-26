"""Moteur d'affinité Ndjoka.

Il remplace le réseau social préexistant par une mise en relation calculée :
chaque tontine ouverte est notée face au profil déclaratif de l'épargnant.
Les règles sont déterministes et explicables, ce qui permet de fonctionner
dès le premier utilisateur puis de constituer la base d'apprentissage.
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from app.modules.cycles.enums import CycleFrequency
from app.modules.discovery.schemas import AffinityReason
from app.modules.profiles.enums import (
    GROUP_SIZE_RANGES,
    ContributionRhythm,
    GroupSizePreference,
)
from app.modules.profiles.models import SaverProfile

WEEKS_PER_MONTH = Decimal("4.333")

WEIGHT_BUDGET = Decimal("0.40")
WEIGHT_RHYTHM = Decimal("0.25")
WEIGHT_GROUP = Decimal("0.20")
WEIGHT_HORIZON = Decimal("0.15")

IDEAL_CAPACITY_USAGE = Decimal("0.70")
NEUTRAL_SCORE = Decimal("0.500")


@dataclass(frozen=True)
class TontineFacts:
    """Caractéristiques d'une tontine utilisées par le calcul d'affinité."""

    contribution_amount: Decimal | None
    frequency: CycleFrequency | None
    max_members: int | None
    member_count: int


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _clamp(value: Decimal) -> Decimal:
    return max(Decimal("0"), min(Decimal("1"), value))


def monthly_equivalent(
    amount: Decimal | None, frequency: CycleFrequency | None
) -> Decimal | None:
    """Ramener une cotisation à une charge mensuelle comparable."""
    if amount is None or frequency is None:
        return None
    if frequency == CycleFrequency.WEEKLY:
        return (amount * WEEKS_PER_MONTH).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _budget_fit(charge: Decimal | None, capacity: Decimal) -> tuple[Decimal, bool, str]:
    if charge is None:
        return NEUTRAL_SCORE, False, "Montant de cotisation pas encore défini"
    ratio = charge / capacity
    if ratio <= 1:
        distance = abs(ratio - IDEAL_CAPACITY_USAGE) / IDEAL_CAPACITY_USAGE
        score = _clamp(Decimal("1") - distance)
        return score, True, f"{charge} par mois, compatible avec votre capacité"
    overflow = ratio - Decimal("1")
    score = _clamp(Decimal("1") - overflow * Decimal("2"))
    return score, False, f"{charge} par mois, au-dessus de votre capacité déclarée"


def _rhythm_fit(
    frequency: CycleFrequency | None, preferred: ContributionRhythm
) -> tuple[Decimal, bool, str]:
    if frequency is None:
        return NEUTRAL_SCORE, False, "Rythme pas encore défini"
    if frequency.value == preferred.value:
        return (
            Decimal("1"),
            True,
            f"Rythme {frequency.value} conforme à votre préférence",
        )
    return (
        Decimal("0.400"),
        False,
        f"Rythme {frequency.value} différent de votre préférence",
    )


def _group_fit(
    max_members: int | None,
    member_count: int,
    preference: GroupSizePreference,
) -> tuple[Decimal, bool, str]:
    low, high = GROUP_SIZE_RANGES[preference]
    target = max_members if max_members is not None else max(member_count, low)
    if low <= target <= high:
        return Decimal("1"), True, f"Groupe de {target} places, taille recherchée"
    distance = Decimal(low - target if target < low else target - high)
    score = _clamp(Decimal("1") - distance / Decimal("10"))
    return score, False, f"Groupe de {target} places, hors de votre taille idéale"


def _horizon_fit(
    max_members: int | None,
    member_count: int,
    frequency: CycleFrequency | None,
    horizon_months: int,
) -> tuple[Decimal, bool, str]:
    if frequency is None:
        return NEUTRAL_SCORE, False, "Durée pas encore estimable"
    turns = max_members if max_members is not None else max(member_count, 2)
    months = (
        Decimal(turns) / WEEKS_PER_MONTH
        if frequency == CycleFrequency.WEEKLY
        else Decimal(turns)
    )
    horizon = Decimal(horizon_months)
    distance = abs(months - horizon) / horizon
    score = _clamp(Decimal("1") - distance)
    rounded = int(months.to_integral_value(rounding=ROUND_HALF_UP))
    matched = score >= Decimal("0.7")
    return score, matched, f"Durée estimée de {rounded} mois pour un tour complet"


def score_affinity(
    profile: SaverProfile | None, facts: TontineFacts
) -> tuple[Decimal, list[AffinityReason]]:
    """Noter une tontine de 0 à 1 face au profil déclaratif de l'épargnant."""
    charge = monthly_equivalent(facts.contribution_amount, facts.frequency)
    if profile is None:
        reasons = [
            AffinityReason(
                criterion="profile",
                label="Complétez votre profil pour une mise en relation personnalisée",
                matched=False,
            )
        ]
        return NEUTRAL_SCORE, reasons

    budget_score, budget_ok, budget_label = _budget_fit(
        charge, profile.monthly_capacity
    )
    rhythm_score, rhythm_ok, rhythm_label = _rhythm_fit(
        facts.frequency, profile.preferred_rhythm
    )
    group_score, group_ok, group_label = _group_fit(
        facts.max_members, facts.member_count, profile.group_size_preference
    )
    horizon_score, horizon_ok, horizon_label = _horizon_fit(
        facts.max_members, facts.member_count, facts.frequency, profile.horizon_months
    )

    total = (
        budget_score * WEIGHT_BUDGET
        + rhythm_score * WEIGHT_RHYTHM
        + group_score * WEIGHT_GROUP
        + horizon_score * WEIGHT_HORIZON
    )
    reasons = [
        AffinityReason(criterion="budget", label=budget_label, matched=budget_ok),
        AffinityReason(criterion="rhythm", label=rhythm_label, matched=rhythm_ok),
        AffinityReason(criterion="group_size", label=group_label, matched=group_ok),
        AffinityReason(criterion="horizon", label=horizon_label, matched=horizon_ok),
    ]
    return _quantize(_clamp(total)), reasons
