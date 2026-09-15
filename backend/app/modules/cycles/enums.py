from enum import StrEnum


class CycleFrequency(StrEnum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class CycleStatus(StrEnum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
