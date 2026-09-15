from enum import StrEnum


class ContributionStatus(StrEnum):
    PENDING = "pending"
    DECLARED = "declared"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class EffectiveContributionStatus(StrEnum):
    PENDING = "pending"
    DECLARED = "declared"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"
    LATE = "late"
    CANCELLED = "cancelled"
