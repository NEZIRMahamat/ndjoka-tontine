from enum import StrEnum


class UserStatus(StrEnum):
    """États possibles du cycle de vie d'un utilisateur Ndjoka."""

    ACTIVE = "active"
    SUSPENDED = "suspended"
    DEACTIVATED = "deactivated"


class GlobalRole(StrEnum):
    """Rôles globaux de la plateforme, indépendants des tontines."""

    USER = "user"
    SUPPORT = "support"
    PLATFORM_ADMIN = "platform_admin"
