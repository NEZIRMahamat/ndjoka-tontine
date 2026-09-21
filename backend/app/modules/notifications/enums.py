from enum import StrEnum


class NotificationStatus(StrEnum):
    UNREAD = "unread"
    READ = "read"


class OutboxStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    PROCESSED = "processed"
    FAILED = "failed"
    DEAD = "dead"


class EmailDeliveryStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DELIVERED = "delivered"
    BOUNCED = "bounced"
    COMPLAINED = "complained"
    FAILED = "failed"
    DEAD = "dead"
