from enum import StrEnum


class TontineStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


class TontineCategory(StrEnum):
    """Thématique affichée dans l'explorateur et la création guidée."""

    BUSINESS = "business"
    FAMILY = "family"
    TRAVEL = "travel"
    SOLIDARITY = "solidarity"
    HOUSING = "housing"
    EDUCATION = "education"
    OTHER = "other"


class TurnOrderMode(StrEnum):
    """Règle de constitution de l'ordre des bénéficiaires."""

    LOTTERY = "lottery"
    REGISTRATION = "registration"
    VOTE = "vote"
