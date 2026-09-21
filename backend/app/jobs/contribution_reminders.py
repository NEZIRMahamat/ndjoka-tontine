import argparse
import asyncio
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.db.session import get_session_factory
from app.modules.contributions.enums import ContributionStatus
from app.modules.contributions.models import Contribution
from app.modules.cycles.enums import CycleStatus
from app.modules.cycles.models import Cycle
from app.modules.memberships.enums import MembershipStatus
from app.modules.memberships.models import Membership
from app.modules.notifications.service import enqueue_event
from app.modules.tontines.models import Tontine
from app.modules.users.enums import UserStatus
from app.modules.users.models import User


async def enqueue_due_reminders() -> int:
    target = datetime.now(UTC) + timedelta(days=3)
    start = target.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    async with get_session_factory()() as session:
        rows = await session.execute(
            select(Contribution, User, Cycle, Tontine)
            .join(Membership, Membership.id == Contribution.membership_id)
            .join(User, User.id == Membership.user_id)
            .join(Cycle, Cycle.id == Contribution.cycle_id)
            .join(Tontine, Tontine.id == Cycle.tontine_id)
            .where(
                Contribution.status == ContributionStatus.PENDING,
                Membership.status == MembershipStatus.ACTIVE,
                User.status == UserStatus.ACTIVE,
                Cycle.status == CycleStatus.ACTIVE,
                Contribution.due_at >= start,
                Contribution.due_at < end,
            )
        )
        count = 0
        try:
            for contribution, user, cycle, tontine in rows:
                await enqueue_event(
                    session,
                    event_name="contribution.due_soon",
                    aggregate_type="contribution",
                    aggregate_id=contribution.id,
                    tontine_id=tontine.id,
                    recipients=[
                        {
                            "user_id": str(user.id),
                            "email": user.email,
                        }
                    ],
                    template_context={
                        "tontine_name": tontine.name,
                        "amount": str(contribution.amount_due),
                        "currency": tontine.currency,
                        "due_at": contribution.due_at.date().isoformat(),
                    },
                    action_path=f"/tontines/{tontine.id}/cycles/{cycle.id}",
                    deduplication_key=(
                        f"contribution:{contribution.id}:reminder:three_days_before"
                    ),
                )
                count += 1
            await session.commit()
            return count
        except Exception:
            await session.rollback()
            raise


def main() -> None:
    parser = argparse.ArgumentParser(description="Créer les rappels de cotisation")
    parser.add_argument("--once", action="store_true")
    arguments = parser.parse_args()
    if not arguments.once:
        parser.error("Le MVP accepte uniquement --once")
    asyncio.run(enqueue_due_reminders())


if __name__ == "__main__":
    main()
