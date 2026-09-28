from uuid import uuid4

from app.modules.cycles.services import order_beneficiaries
from app.modules.memberships.enums import MembershipRole, MembershipStatus
from app.modules.memberships.models import Membership
from app.modules.tontines.enums import TurnOrderMode


def make_members(count: int) -> list[Membership]:
    return [
        Membership(
            id=uuid4(),
            tontine_id=uuid4(),
            user_id=uuid4(),
            role=MembershipRole.MEMBER,
            status=MembershipStatus.ACTIVE,
        )
        for _ in range(count)
    ]


def test_registration_and_vote_keep_joining_order():
    members = make_members(6)
    assert order_beneficiaries(members, TurnOrderMode.REGISTRATION) == members
    assert order_beneficiaries(members, TurnOrderMode.VOTE) == members


def test_lottery_is_a_permutation_without_mutating_input():
    members = make_members(12)
    snapshot = list(members)
    shuffled = order_beneficiaries(members, TurnOrderMode.LOTTERY)
    assert members == snapshot
    assert sorted(item.id for item in shuffled) == sorted(item.id for item in members)
    assert len(shuffled) == len(members)
