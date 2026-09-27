"""Tests unitaires du score de fiabilité prédictif (sans base de données)."""

from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace

from app.modules.profiles.ml_reliability import build_features, load_model, predict
from app.modules.profiles.repositories import ReliabilityFacts


def _facts(total=0, on_time=0, late=0, outstanding=0):
    return SimpleNamespace(
        contributions_total=total,
        contributions_on_time=on_time,
        contributions_late=late,
        contributions_outstanding=outstanding,
        cycles_completed=0,
    )


def _profile(capacity="100000", experience="beginner"):
    return SimpleNamespace(
        monthly_capacity=Decimal(capacity),
        horizon_months=12,
        experience_level=experience,
        savings_goal="project",
        preferred_rhythm="monthly",
        turn_preference="flexible",
    )


def _probability(facts, profile, amount=None, month=6):
    model = load_model()
    features, _ = build_features(
        facts,
        profile,
        contribution_amount=Decimal(amount) if amount else None,
        frequency="monthly",
        moment=datetime(2026, month, 15, tzinfo=UTC),
        model=model,
    )
    return predict(features, model).probability


def test_facts_type_is_importable():
    assert ReliabilityFacts is not None


def test_model_file_is_valid():
    model = load_model()
    assert model["features"]["numeric"]
    assert 0 < model["metrics"]["auc"] <= 1


def test_probability_is_between_zero_and_one():
    assert 0 < _probability(_facts(), None) < 1


def test_heavy_effort_increases_risk():
    light = _probability(_facts(), _profile(), amount="20000")
    heavy = _probability(_facts(), _profile(), amount="120000")
    assert heavy > light


def test_experience_decreases_risk():
    beginner = _probability(_facts(), _profile(experience="beginner"))
    experienced = _probability(_facts(), _profile(experience="experienced"))
    assert experienced < beginner


def test_good_history_decreases_risk():
    punctual = _probability(_facts(total=10, on_time=10), _profile())
    late = _probability(_facts(total=10, on_time=4, late=4, outstanding=2), _profile())
    assert punctual < late


def test_newcomers_are_distinguished_by_profile():
    careful = _probability(_facts(), _profile(experience="experienced"), amount="30000")
    risky = _probability(_facts(), _profile(experience="beginner"), amount="110000")
    assert careful != risky
