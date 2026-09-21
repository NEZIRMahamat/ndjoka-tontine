import asyncio
import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import httpx2 as httpx
import pytest
from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool
from svix.webhooks import Webhook

from app.core.auth0 import get_current_token_payload
from app.core.config import EmailSettings, get_email_settings
from app.db.session import build_session_factory, get_db_session
from app.jobs import contribution_reminders
from app.main import app
from app.modules.contributions.models import Contribution
from app.modules.cycles.enums import CycleFrequency, CycleStatus
from app.modules.cycles.models import Cycle, CycleTurn
from app.modules.memberships.enums import MembershipRole, MembershipStatus
from app.modules.memberships.models import Membership
from app.modules.notifications.email import EmailProviderError, FakeEmailProvider
from app.modules.notifications.enums import EmailDeliveryStatus, OutboxStatus
from app.modules.notifications.models import (
    EmailDelivery,
    Notification,
    OutboxEvent,
    ResendWebhookEvent,
)
from app.modules.notifications.service import enqueue_event, process_outbox_once
from app.modules.tontines.models import Tontine
from app.modules.users.services import get_or_create_user_by_auth0_sub
from app.schemas.auth import TokenPayload

pytestmark = pytest.mark.integration
SETTINGS = EmailSettings(_env_file=None, email_provider="console")


def run_scenario(database_url, scenario):
    async def run():
        engine = create_async_engine(database_url, poolclass=NullPool)
        try:
            await scenario(build_session_factory(engine))
        finally:
            await engine.dispose()

    asyncio.run(run())


def test_outbox_commit_worker_dedup_and_notification_permissions(test_database_url):
    async def scenario(factory):
        async with factory() as session:
            alice = await get_or_create_user_by_auth0_sub(session, "auth0|alice")
            bob = await get_or_create_user_by_auth0_sub(session, "auth0|bob")
            alice.email = "alice@example.test"
            await session.commit()
            alice_id, bob_id = alice.id, bob.id
            data = dict(
                event_name="invitation.created",
                aggregate_type="invitation",
                aggregate_id=uuid4(),
                tontine_id=None,
                recipients=[{"user_id": str(alice_id), "email": alice.email}],
                template_context={"tontine_name": "Famille", "role": "member"},
                action_path="/invitations",
                deduplication_key="invitation:test:created",
            )
            await enqueue_event(session, **data)
            await enqueue_event(session, **data)
            assert (
                await session.scalar(select(func.count()).select_from(OutboxEvent)) == 1
            )
            await session.rollback()
            assert (
                await session.scalar(select(func.count()).select_from(OutboxEvent)) == 0
            )
            await enqueue_event(session, **data)
            await session.commit()

        provider = FakeEmailProvider()
        async with factory() as session:
            assert await process_outbox_once(session, provider, SETTINGS) == 1
            assert await process_outbox_once(session, provider, SETTINGS) == 0
            assert len(provider.sent) == 1
            assert provider.sent[0][0].from_address == "contact@ndjoka-tontine.com"
            event = await session.scalar(select(OutboxEvent))
            assert event.status == OutboxStatus.PROCESSED
            delivery = await session.scalar(select(EmailDelivery))
            assert delivery.status == EmailDeliveryStatus.ACCEPTED
            assert provider.sent[0][1] == delivery.idempotency_key
            notification = await session.scalar(select(Notification))
            assert notification.recipient_user_id == alice_id
            notification_id = notification.id

        async def session_dependency():
            async with factory() as session:
                yield session

        def token_dependency(request: Request):
            return TokenPayload(
                sub=request.headers.get("X-Test-Subject", "auth0|alice"),
                iss="https://test.auth0.com/",
                aud="test",
                exp=4102444800,
                iat=1700000000,
            )

        app.dependency_overrides[get_db_session] = session_dependency
        app.dependency_overrides[get_current_token_payload] = token_dependency
        try:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test"
            ) as client:
                path = "/api/v1/me/notifications"
                response = await client.get(path)
                assert response.status_code == 200
                assert len(response.json()["items"]) == 1
                assert (await client.get(path + "/unread-count")).json() == {"count": 1}
                assert (
                    await client.get(
                        f"{path}/{notification_id}",
                        headers={"X-Test-Subject": "auth0|bob"},
                    )
                ).status_code == 404
                assert (
                    await client.post(f"{path}/{notification_id}/read")
                ).status_code == 200
                assert (await client.get(path + "/unread-count")).json() == {"count": 0}
                assert (await client.post(path + "/read-all")).json() == {"updated": 0}
                assert (
                    await client.get(path, headers={"X-Test-Subject": "auth0|bob"})
                ).json()["items"] == []
        finally:
            app.dependency_overrides.clear()

        assert bob_id != alice_id

    run_scenario(test_database_url, scenario)


def test_three_day_reminder_is_idempotent(test_database_url, monkeypatch):
    async def scenario(factory):
        async with factory() as session:
            user = await get_or_create_user_by_auth0_sub(session, "auth0|reminder")
            user.email = "reminder@example.test"
            tontine = Tontine(name="Rappel famille", created_by_user_id=user.id)
            session.add(tontine)
            await session.flush()
            membership = Membership(
                tontine_id=tontine.id,
                user_id=user.id,
                role=MembershipRole.OWNER,
                status=MembershipStatus.ACTIVE,
            )
            session.add(membership)
            await session.flush()
            due_at = datetime.now(UTC) + timedelta(days=3)
            cycle = Cycle(
                tontine_id=tontine.id,
                sequence_number=1,
                name="Cycle rappel",
                contribution_amount=Decimal("20.00"),
                frequency=CycleFrequency.WEEKLY,
                start_date=due_at.date(),
                status=CycleStatus.ACTIVE,
                activated_at=datetime.now(UTC),
                created_by_user_id=user.id,
            )
            session.add(cycle)
            await session.flush()
            turn = CycleTurn(
                cycle_id=cycle.id,
                position=1,
                beneficiary_membership_id=membership.id,
                scheduled_for=due_at,
            )
            session.add(turn)
            await session.flush()
            contribution = Contribution(
                cycle_id=cycle.id,
                turn_id=turn.id,
                membership_id=membership.id,
                amount_due=Decimal("20.00"),
                due_at=due_at,
            )
            session.add(contribution)
            await session.commit()
            contribution_id = contribution.id

        monkeypatch.setattr(
            contribution_reminders, "get_session_factory", lambda: factory
        )
        assert await contribution_reminders.enqueue_due_reminders() == 1
        await contribution_reminders.enqueue_due_reminders()
        async with factory() as session:
            events = list(await session.scalars(select(OutboxEvent)))
            assert len(events) == 1
            assert events[0].deduplication_key == (
                f"contribution:{contribution_id}:reminder:three_days_before"
            )
            provider = FakeEmailProvider()
            assert await process_outbox_once(session, provider, SETTINGS) == 1
            assert len(provider.sent) == 1
            assert (
                provider.sent[0][0].from_address == "notifications@ndjoka-tontine.com"
            )

    run_scenario(test_database_url, scenario)


def test_worker_retry_dead_and_signed_webhook(test_database_url):
    class FailingProvider:
        async def send(self, _message, *, idempotency_key):
            assert idempotency_key
            raise EmailProviderError("rate_limited", temporary=True)

    async def scenario(factory):
        async with factory() as session:
            user = await get_or_create_user_by_auth0_sub(session, "auth0|recipient")
            user.email = "recipient@example.test"
            await session.commit()
            await enqueue_event(
                session,
                event_name="invitation.created",
                aggregate_type="invitation",
                aggregate_id=uuid4(),
                tontine_id=None,
                recipients=[{"user_id": str(user.id), "email": user.email}],
                template_context={"tontine_name": "Famille", "role": "member"},
                action_path="/invitations",
                deduplication_key="invitation:test:retry",
            )
            await session.commit()
            assert await process_outbox_once(session, FailingProvider(), SETTINGS) == 0
            event = await session.scalar(select(OutboxEvent))
            assert event.status == OutboxStatus.FAILED
            assert event.attempt_count == 1
            assert await process_outbox_once(session, FailingProvider(), SETTINGS) == 0
            for attempt in (2, 3):
                event.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
                await session.commit()
                assert (
                    await process_outbox_once(session, FailingProvider(), SETTINGS) == 0
                )
                assert event.attempt_count == attempt
            assert event.status == OutboxStatus.DEAD
            delivery = await session.scalar(select(EmailDelivery))
            assert delivery.status == EmailDeliveryStatus.DEAD
            delivery.resend_email_id = "email_test"
            await session.commit()

        secret = "whsec_" + "a" * 32
        webhook = Webhook(secret)
        payload = json.dumps(
            {
                "type": "email.bounced",
                "created_at": datetime.now(UTC).isoformat(),
                "data": {"email_id": "email_test"},
            }
        )
        msg_id = "msg_" + uuid4().hex
        now = datetime.now(UTC)
        headers = {
            "svix-id": msg_id,
            "svix-timestamp": str(int(now.timestamp())),
            "svix-signature": webhook.sign(msg_id, now, payload),
        }
        app.dependency_overrides[get_email_settings] = lambda: EmailSettings(
            _env_file=None,
            resend_webhook_secret=secret,
        )

        async def session_dependency():
            async with factory() as session:
                yield session

        app.dependency_overrides[get_db_session] = session_dependency
        try:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test"
            ) as client:
                path = "/api/v1/webhooks/resend"
                assert (await client.post(path, content=payload)).status_code == 400
                bad_headers = {**headers, "svix-signature": "v1,invalid"}
                assert (
                    await client.post(path, content=payload, headers=bad_headers)
                ).status_code == 400
                response = await client.post(path, content=payload, headers=headers)
                assert response.status_code == 200
                assert response.json() == {"processed": True}
                duplicate = await client.post(path, content=payload, headers=headers)
                assert duplicate.json() == {"processed": False}
        finally:
            app.dependency_overrides.clear()
        async with factory() as session:
            assert (
                await session.scalar(
                    select(func.count()).select_from(ResendWebhookEvent)
                )
                == 1
            )
            delivery = await session.scalar(select(EmailDelivery))
            assert delivery.status == EmailDeliveryStatus.BOUNCED

    run_scenario(test_database_url, scenario)
