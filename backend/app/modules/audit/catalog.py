from dataclasses import dataclass


@dataclass(frozen=True)
class EventContract:
    resource_type: str
    change_fields: frozenset[str]


def contract(resource_type: str, *fields: str) -> EventContract:
    return EventContract(resource_type, frozenset(fields))


# Adding an event or an audited field requires an explicit review here. This avoids
# leaking complete domain objects into the JSONB payloads.
EVENT_CATALOG = {
    "user.profile_updated": contract(
        "user",
        "display_name",
        "avatar_url",
        "locale",
        "timezone",
        "phone",
        "address",
        "city",
    ),
    "user.deactivated": contract("user", "status"),
    "user.status_changed": contract("user", "status"),
    "user.global_role_changed": contract("user", "global_role"),
    "tontine.created": contract(
        "tontine",
        "name",
        "currency",
        "max_members",
        "status",
        "category",
        "is_discoverable",
        "order_mode",
    ),
    "tontine.updated": contract(
        "tontine",
        "name",
        "description",
        "currency",
        "max_members",
        "is_discoverable",
        "min_reliability_score",
        "category",
        "goal",
        "city",
        "order_mode",
        "rules",
        "late_penalty_enabled",
        "cover_image_url",
    ),
    "tontine.archived": contract("tontine", "status"),
    "invitation.created": contract("invitation", "role", "status"),
    "invitation.accepted": contract("invitation", "status", "membership_id", "role"),
    "invitation.revoked": contract("invitation", "status"),
    "membership.role_changed": contract("membership", "role"),
    "membership.joined_open_tontine": contract("membership", "role"),
    "membership.removed": contract("membership", "status"),
    "membership.left": contract("membership", "status"),
    "membership.ownership_transferred": contract("membership", "owner_user_id"),
    "cycle.created": contract(
        "cycle",
        "sequence_number",
        "status",
        "contribution_amount",
        "frequency",
        "start_date",
        "beneficiary_contributes",
    ),
    "cycle.updated": contract(
        "cycle",
        "contribution_amount",
        "frequency",
        "start_date",
        "beneficiary_contributes",
    ),
    "cycle.turns_generated": contract("cycle", "turn_count", "order_mode"),
    "cycle.launched": contract("cycle", "status", "turn_count", "order_mode"),
    "cycle.order_updated": contract("cycle", "beneficiary_membership_ids"),
    "cycle.scheduled": contract("cycle", "status"),
    "cycle.activated": contract("cycle", "status"),
    "cycle.completed": contract("cycle", "status"),
    "cycle.cancelled": contract("cycle", "status"),
    "contribution.declared": contract("contribution", "status"),
    "contribution.confirmed": contract("contribution", "status"),
    "contribution.rejected": contract("contribution", "status"),
    "payout.generated": contract("payout", "status", "expected_amount", "currency"),
    "payout.pending": contract("payout", "status"),
    "payout.ready": contract("payout", "status"),
    "payout.approved": contract("payout", "status", "approved_amount"),
    "payout.declared_paid": contract("payout", "status"),
    "payout.received": contract("payout", "status"),
    "payout.disputed": contract("payout", "status", "reason_provided"),
    "payout.dispute_resolved": contract("payout", "status", "resolution_provided"),
    "payout.cancelled": contract("payout", "status", "reason", "reason_provided"),
    "payment_method.added": contract("payment_method", "type", "is_default"),
    "payment_method.default_changed": contract("payment_method", "is_default"),
    "payment_method.removed": contract("payment_method", "type"),
}
