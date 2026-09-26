from enum import StrEnum


class SavingsGoal(StrEnum):
    """Objectif d'épargne déclaré à l'inscription."""

    PROJECT = "project"
    EMERGENCY = "emergency"
    HOUSING = "housing"
    EDUCATION = "education"
    BUSINESS = "business"


class ContributionRhythm(StrEnum):
    """Rythme de cotisation souhaité, aligné sur les fréquences de cycle."""

    WEEKLY = "weekly"
    MONTHLY = "monthly"


class GroupSizePreference(StrEnum):
    """Taille de groupe recherchée."""

    SMALL = "small"
    MEDIUM = "medium"
    LARGE = "large"


class ExperienceLevel(StrEnum):
    """Familiarité déclarée avec la tontine."""

    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    EXPERIENCED = "experienced"


class TurnPreference(StrEnum):
    """Position de tour préférée dans la rotation."""

    EARLY = "early"
    FLEXIBLE = "flexible"
    LATE = "late"


GROUP_SIZE_RANGES: dict[GroupSizePreference, tuple[int, int]] = {
    GroupSizePreference.SMALL: (2, 6),
    GroupSizePreference.MEDIUM: (7, 12),
    GroupSizePreference.LARGE: (13, 2_147_483_647),
}
