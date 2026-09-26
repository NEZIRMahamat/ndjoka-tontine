from decimal import Decimal

import pytest

from app.db.models import load_all_models
from app.modules.cycles.enums import CycleFrequency
from app.modules.discovery.matching import (
    TontineFacts,
    monthly_equivalent,
    score_affinity,
)
from app.modules.profiles.enums import (
    ContributionRhythm,
    ExperienceLevel,
    GroupSizePreference,
    SavingsGoal,
    TurnPreference,
)
from app.modules.profiles.models import SaverProfile
from app.modules.profiles.reliability import band_of, compute_score
from app.modules.profiles.repositories import ReliabilityFacts

load_all_models()


def facts(**overrides) -> ReliabilityFacts:
    base = {
        "contributions_total": 0,
        "contributions_on_time": 0,
        "contributions_late": 0,
        "contributions_outstanding": 0,
        "cycles_completed": 0,
    }
    return ReliabilityFacts(**{**base, **overrides})


def test_newcomer_gets_neutral_score():
    assert compute_score(facts()) == Decimal("0.500")


def test_flawless_history_reaches_excellent_band():
    score = compute_score(
        facts(contributions_total=12, contributions_on_time=12, cycles_completed=2)
    )
    assert score == Decimal("0.910")
    assert band_of(score) == "excellent"


def test_outstanding_defaults_are_penalised():
    clean = compute_score(facts(contributions_total=10, contributions_on_time=10))
    defaulting = compute_score(
        facts(
            contributions_total=10,
            contributions_on_time=8,
            contributions_outstanding=2,
        )
    )
    assert defaulting < clean


def test_penalty_is_capped():
    heavy = compute_score(
        facts(
            contributions_total=20,
            contributions_on_time=0,
            contributions_outstanding=20,
        )
    )
    assert heavy >= Decimal("0")
    assert band_of(heavy) == "fragile"


def test_score_never_leaves_unit_interval():
    best = compute_score(
        facts(contributions_total=50, contributions_on_time=50, cycles_completed=99)
    )
    assert Decimal("0") <= best <= Decimal("1")


@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (Decimal("0.95"), "excellent"),
        (Decimal("0.80"), "excellent"),
        (Decimal("0.70"), "bon"),
        (Decimal("0.50"), "moyen"),
        (Decimal("0.20"), "fragile"),
    ],
)
def test_bands(score, expected):
    assert band_of(score) == expected


def profile(**overrides) -> SaverProfile:
    base = {
        "monthly_capacity": Decimal("200.00"),
        "preferred_rhythm": ContributionRhythm.MONTHLY,
        "savings_goal": SavingsGoal.PROJECT,
        "horizon_months": 10,
        "group_size_preference": GroupSizePreference.MEDIUM,
        "experience_level": ExperienceLevel.BEGINNER,
        "turn_preference": TurnPreference.FLEXIBLE,
    }
    return SaverProfile(**{**base, **overrides})


def test_weekly_amount_is_converted_to_monthly_charge():
    assert monthly_equivalent(Decimal("25"), CycleFrequency.WEEKLY) == Decimal("108.33")
    assert monthly_equivalent(Decimal("25"), CycleFrequency.MONTHLY) == Decimal("25.00")
    assert monthly_equivalent(None, CycleFrequency.MONTHLY) is None


def test_ideal_tontine_scores_high():
    score, reasons = score_affinity(
        profile(),
        TontineFacts(
            contribution_amount=Decimal("140"),
            frequency=CycleFrequency.MONTHLY,
            max_members=10,
            member_count=4,
        ),
    )
    assert score >= Decimal("0.90")
    assert all(reason.matched for reason in reasons)


def test_unaffordable_tontine_is_downgraded():
    score, reasons = score_affinity(
        profile(),
        TontineFacts(
            contribution_amount=Decimal("600"),
            frequency=CycleFrequency.MONTHLY,
            max_members=10,
            member_count=4,
        ),
    )
    budget = next(reason for reason in reasons if reason.criterion == "budget")
    assert not budget.matched
    assert score < Decimal("0.70")


def test_rhythm_mismatch_lowers_score():
    aligned, _ = score_affinity(
        profile(preferred_rhythm=ContributionRhythm.MONTHLY),
        TontineFacts(Decimal("140"), CycleFrequency.MONTHLY, 10, 4),
    )
    misaligned, _ = score_affinity(
        profile(preferred_rhythm=ContributionRhythm.WEEKLY),
        TontineFacts(Decimal("140"), CycleFrequency.MONTHLY, 10, 4),
    )
    assert misaligned < aligned


def test_missing_profile_returns_neutral_score_and_invitation():
    score, reasons = score_affinity(
        None, TontineFacts(Decimal("100"), CycleFrequency.MONTHLY, 8, 3)
    )
    assert score == Decimal("0.500")
    assert reasons[0].criterion == "profile"


def test_tontine_without_cycle_stays_neutral_on_budget():
    score, reasons = score_affinity(profile(), TontineFacts(None, None, None, 0))
    assert Decimal("0") <= score <= Decimal("1")
    assert {reason.criterion for reason in reasons} == {
        "budget",
        "rhythm",
        "group_size",
        "horizon",
    }
