"""Score de fiabilité Ndjoka.

Le score est un indicateur de réputation compris entre 0 et 1, calculé de
manière déterministe à partir du comportement réel de l'utilisateur. Cette
approche par règles répond au démarrage à froid : tant que l'historique est
insuffisant, le score est explicitement marqué comme provisoire plutôt que
d'être extrapolé.
"""

from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.profiles import repositories
from app.modules.profiles.repositories import ReliabilityFacts
from app.modules.profiles.schemas import ReliabilityRead

NEWCOMER_SCORE = Decimal("0.500")
BASELINE = Decimal("0.350")
ON_TIME_WEIGHT = Decimal("0.500")
OUTSTANDING_PENALTY = Decimal("0.080")
MAX_OUTSTANDING_PENALTY = Decimal("0.250")
CYCLE_BONUS = Decimal("0.030")
MAX_BONUS_CYCLES = 5
PROVISIONAL_THRESHOLD = 6

BANDS = (
    (Decimal("0.80"), "excellent"),
    (Decimal("0.65"), "bon"),
    (Decimal("0.45"), "moyen"),
)


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def band_of(score: Decimal) -> str:
    for threshold, label in BANDS:
        if score >= threshold:
            return label
    return "fragile"


def compute_score(facts: ReliabilityFacts) -> Decimal:
    """Appliquer les règles déterministes de l'étape 1 de la trajectoire Data."""
    if facts.contributions_total == 0:
        return NEWCOMER_SCORE

    on_time_rate = Decimal(facts.contributions_on_time) / Decimal(
        facts.contributions_total
    )
    penalty = min(
        OUTSTANDING_PENALTY * facts.contributions_outstanding,
        MAX_OUTSTANDING_PENALTY,
    )
    bonus = CYCLE_BONUS * min(facts.cycles_completed, MAX_BONUS_CYCLES)
    score = BASELINE + ON_TIME_WEIGHT * on_time_rate - penalty + bonus
    return _quantize(max(Decimal("0"), min(Decimal("1"), score)))


def _explain(facts: ReliabilityFacts, score: Decimal, provisional: bool) -> str:
    if facts.contributions_total == 0:
        return (
            "Score provisoire : aucune échéance n'est encore arrivée à terme. "
            "Il évoluera dès vos premières cotisations."
        )
    parts = [
        f"{facts.contributions_on_time} cotisation(s) réglée(s) à l'heure "
        f"sur {facts.contributions_total}"
    ]
    if facts.contributions_late:
        parts.append(f"{facts.contributions_late} règlement(s) en retard")
    if facts.contributions_outstanding:
        parts.append(
            f"{facts.contributions_outstanding} échéance(s) non régularisée(s)"
        )
    if facts.cycles_completed:
        parts.append(f"{facts.cycles_completed} cycle(s) mené(s) à terme")
    suffix = (
        " Score encore provisoire faute d'historique suffisant." if provisional else ""
    )
    return f"Score {score} calculé sur : " + ", ".join(parts) + "." + suffix


async def get_reliability(
    session: AsyncSession, user_id: UUID, *, now: datetime | None = None
) -> ReliabilityRead:
    """Calculer le score de fiabilité courant d'un utilisateur."""
    moment = now or datetime.now(UTC)
    facts = await repositories.collect_reliability_facts(session, user_id, moment)
    score = compute_score(facts)
    provisional = facts.contributions_total < PROVISIONAL_THRESHOLD
    on_time_rate = (
        _quantize(
            Decimal(facts.contributions_on_time) / Decimal(facts.contributions_total)
        )
        if facts.contributions_total
        else None
    )
    return ReliabilityRead(
        score=score,
        band=band_of(score),
        is_provisional=provisional,
        contributions_total=facts.contributions_total,
        contributions_on_time=facts.contributions_on_time,
        contributions_late=facts.contributions_late,
        contributions_outstanding=facts.contributions_outstanding,
        cycles_completed=facts.cycles_completed,
        on_time_rate=on_time_rate,
        explanation=_explain(facts, score, provisional),
    )
