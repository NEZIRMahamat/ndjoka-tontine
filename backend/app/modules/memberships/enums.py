from enum import StrEnum


class MembershipRole(StrEnum):
    OWNER = "owner"
    MANAGER = "manager"
    TREASURER = "treasurer"
    MEMBER = "member"


class MembershipStatus(StrEnum):
    ACTIVE = "active"
    LEFT = "left"
    REMOVED = "removed"


class InvitationStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    EXPIRED = "expired"
    REVOKED = "revoked"
