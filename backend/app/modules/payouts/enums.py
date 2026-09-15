from enum import StrEnum


class PayoutStatus(StrEnum):
    PENDING = "pending"
    READY = "ready"
    APPROVED = "approved"
    DECLARED_PAID = "declared_paid"
    RECEIVED = "received"
    DISPUTED = "disputed"
    CANCELLED = "cancelled"
