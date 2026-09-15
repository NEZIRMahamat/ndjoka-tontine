import asyncio
from contextlib import asynccontextmanager
from decimal import Decimal
from uuid import UUID, uuid4

import httpx2 as httpx
import pytest
from fastapi import Request
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.auth0 import get_current_token_payload
from app.db.session import build_session_factory, get_db_session
from app.main import app
from app.modules.contributions.models import Contribution
from app.modules.memberships.models import Membership
from app.modules.payouts.models import Payout
from app.modules.users.models import User
from app.schemas.auth import TokenPayload

pytestmark = pytest.mark.integration


@asynccontextmanager
async def environment(url, beneficiary_contributes=True, future=False):
    engine = create_async_engine(url, poolclass=NullPool)
    factory = build_session_factory(engine)

    async def session_dependency():
        async with factory() as session:
            yield session

    def token_dependency(request: Request):
        who = request.headers.get("X-Actor", "owner")
        return TokenPayload(
            sub="auth0|payout-" + who,
            email=who + "@example.com",
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
            created = await client.post(
                "/api/v1/tontines", json={"name": "Versements test"}
            )
            assert created.status_code == 201, created.text
            base = "/api/v1/tontines/" + created.json()["id"]
            for role in ["manager", "treasurer", "member"]:
                invitation = await client.post(
                    base + "/invitations",
                    json={"email": role + "@example.com", "role": role},
                )
                assert invitation.status_code == 201, invitation.text
                accepted = await client.post(
                    "/api/v1/invitations/accept",
                    headers={"X-Actor": role},
                    json={"token": invitation.json()["token"]},
                )
                assert accepted.status_code == 200, accepted.text
            cycle = await client.post(
                base + "/cycles",
                json={
                    "name": "Cycle versements",
                    "contribution_amount": "12.35",
                    "frequency": "weekly",
                    "start_date": "2099-01-01" if future else "2020-01-01",
                    "beneficiary_contributes": beneficiary_contributes,
                },
            )
            assert cycle.status_code == 201, cycle.text
            cycle_path = base + "/cycles/" + cycle.json()["id"]
            for suffix in ["/turns/generate", "/schedule", "/activate"]:
                result = await client.post(cycle_path + suffix)
                assert result.status_code == 200, result.text
            async with factory() as session:
                rows = (
                    await session.execute(
                        select(Membership.id, User.auth0_sub).join(
                            User, User.id == Membership.user_id
                        )
                    )
                ).all()
                actors = {
                    str(mid): sub.removeprefix("auth0|payout-") for mid, sub in rows
                }
            yield client, factory, base, cycle_path, actors
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


async def payout_items(client, path):
    result = await client.get(path + "/payouts")
    assert result.status_code == 200, result.text
    return result.json()["items"]


async def fund_turn(client, cycle_path, item, actors, *, last_only=False):
    response = await client.get(cycle_path + "/contributions")
    entries = [
        entry
        for entry in response.json()["items"]
        if entry["turn_id"] == item["turn_id"]
    ]
    if last_only:
        entries = entries[-1:]
    for entry in entries:
        path = "/api/v1/contributions/" + entry["id"]
        declared = await client.post(
            path + "/declare",
            headers={"X-Actor": actors[entry["membership_id"]]},
            json={},
        )
        assert declared.status_code == 200, declared.text
        confirmed = await client.post(
            path + "/confirm", headers={"X-Actor": "treasurer"}
        )
        assert confirmed.status_code == 200, confirmed.text


@pytest.mark.parametrize(
    "beneficiary_contributes,expected", [(True, "49.40"), (False, "37.05")]
)
def test_generation_amounts_and_real_http_lifecycle(
    test_database_url, beneficiary_contributes, expected
):
    async def scenario():
        async with environment(test_database_url, beneficiary_contributes) as (
            client,
            factory,
            base,
            path,
            actors,
        ):
            items = await payout_items(client, path)
            assert len(items) == 4
            assert all(
                Decimal(p["expected_amount"]) == Decimal(expected)
                and p["status"] == "pending"
                for p in items
            )
            turns = (await client.get(path)).json()["turns"]
            assert {p["turn_id"]: p["beneficiary_membership_id"] for p in items} == {
                t["id"]: t["beneficiary_membership_id"] for t in turns
            }
            # Concurrent catchup must serialize and never duplicate.
            generated = await asyncio.gather(
                *(client.post(path + "/payouts/generate") for _ in range(3))
            )
            assert [r.status_code for r in generated] == [200] * 3
            assert len(await payout_items(client, path)) == 4
            item = next(
                p for p in items if actors[p["beneficiary_membership_id"]] == "member"
            )
            target = "/api/v1/payouts/" + item["id"]
            assert (
                await client.post(
                    target + "/approve", json={"approved_amount": expected}
                )
            ).status_code == 409
            await fund_turn(client, path, item, actors)
            ready = (await client.get(target)).json()
            assert ready["status"] == "ready" and Decimal(
                ready["available_amount"]
            ) == Decimal(expected)
            assert (
                await client.post(target + "/approve", json={"approved_amount": "1"})
            ).status_code == 409
            for role in ["treasurer", "member"]:
                assert (
                    await client.post(
                        target + "/approve",
                        headers={"X-Actor": role},
                        json={"approved_amount": expected},
                    )
                ).status_code == 403
            approvals = await asyncio.gather(
                *(
                    client.post(
                        target + "/approve",
                        headers={"X-Actor": "manager"},
                        json={"approved_amount": expected},
                    )
                    for _ in range(2)
                )
            )
            assert sorted(r.status_code for r in approvals) == [200, 409]
            assert (
                await client.post(
                    target + "/declare-paid", headers={"X-Actor": "manager"}, json={}
                )
            ).status_code == 403
            payments = await asyncio.gather(
                *(
                    client.post(
                        target + "/declare-paid",
                        headers={"X-Actor": "treasurer"},
                        json={
                            "external_reference": "MANUAL-42",
                            "payment_note": "Test sans donnée bancaire",
                        },
                    )
                    for _ in range(2)
                )
            )
            assert sorted(r.status_code for r in payments) == [200, 409]
            assert (await client.post(target + "/confirm-receipt")).status_code == 403
            received = await client.post(
                target + "/confirm-receipt", headers={"X-Actor": "member"}
            )
            assert (
                received.status_code == 200 and received.json()["status"] == "received"
            )
            assert (
                await client.post(target + "/cancel", json={"reason": "annulation"})
            ).status_code == 409
            assert (
                await client.post(
                    target + "/confirm-receipt", headers={"X-Actor": "member"}
                )
            ).status_code == 409
            summary = (await client.get(path + "/payouts/summary")).json()
            assert summary["counts"]["received"] == 1 and Decimal(
                summary["received_amount"]
            ) == Decimal(expected)
            personal = (
                await client.get("/api/v1/me/payouts", headers={"X-Actor": "member"})
            ).json()
            assert personal["total"] == 1 and personal["items"][0]["id"] == item["id"]
            filtered = (
                await client.get(path + "/payouts?status=received&limit=1")
            ).json()
            assert filtered["total"] == 1 and len(filtered["items"]) == 1

    asyncio.run(scenario())


def test_dispute_privacy_isolation_and_cancellation(test_database_url):
    async def scenario():
        async with environment(test_database_url) as (
            client,
            factory,
            base,
            path,
            actors,
        ):
            items = await payout_items(client, path)
            item = next(
                p
                for p in items
                if actors[p["beneficiary_membership_id"]] == "treasurer"
            )
            target = "/api/v1/payouts/" + item["id"]
            await fund_turn(client, path, item, actors)
            assert (
                await client.post(
                    target + "/approve", json={"approved_amount": "49.40"}
                )
            ).status_code == 200
            assert (
                await client.post(
                    target + "/declare-paid", json={"external_reference": "PRIVATE"}
                )
            ).status_code == 200
            ordinary = (await client.get(target, headers={"X-Actor": "member"})).json()
            for field in [
                "external_reference",
                "payment_note",
                "approved_by_user_id",
                "dispute_reason",
            ]:
                assert field not in ordinary
            collection = (
                await client.get(path + "/payouts", headers={"X-Actor": "member"})
            ).json()
            other = next(p for p in collection["items"] if p["id"] == item["id"])
            assert "external_reference" not in other
            assert (
                await client.get(target, headers={"X-Actor": "outsider"})
            ).status_code == 404
            other_tontine = await client.post(
                "/api/v1/tontines", json={"name": "Autre tontine"}
            )
            badpath = (
                "/api/v1/tontines/"
                + other_tontine.json()["id"]
                + "/cycles/"
                + item["cycle_id"]
                + "/payouts"
            )
            assert (await client.get(badpath)).status_code == 404
            assert (
                await client.post(target + "/dispute", json={"reason": "Non reçu"})
            ).status_code == 403
            assert (
                await client.post(
                    target + "/dispute",
                    headers={"X-Actor": "treasurer"},
                    json={"reason": " "},
                )
            ).status_code == 422
            dispute = await client.post(
                target + "/dispute",
                headers={"X-Actor": "treasurer"},
                json={"reason": "Fonds non reçus"},
            )
            assert dispute.status_code == 200 and dispute.json()["status"] == "disputed"
            assert (
                await client.post(target + "/cancel", json={"reason": "Pas possible"})
            ).status_code == 409
            assert (
                await client.post(
                    target + "/resolve-dispute",
                    headers={"X-Actor": "treasurer"},
                    json={"resolution_note": "Vérifié"},
                )
            ).status_code == 403
            resolved = await client.post(
                target + "/resolve-dispute",
                headers={"X-Actor": "manager"},
                json={"resolution_note": "Réception vérifiée avec le bénéficiaire"},
            )
            assert (
                resolved.status_code == 200
                and resolved.json()["resolved_at"]
                and resolved.json()["received_at"]
            )
            assert resolved.json()["dispute_reason"] == "Fonds non reçus"
            pending = next(p for p in items if p["id"] != item["id"])
            pending_path = "/api/v1/payouts/" + pending["id"]
            assert (
                await client.post(
                    pending_path + "/cancel",
                    headers={"X-Actor": "manager"},
                    json={"reason": "Arrêt"},
                )
            ).status_code == 403
            assert (
                await client.post(
                    pending_path + "/cancel", json={"reason": "Arrêt demandé"}
                )
            ).status_code == 200
            assert (await client.post(path + "/cancel")).status_code == 200
            states = [p["status"] for p in await payout_items(client, path)]
            assert states.count("received") == 1 and states.count("cancelled") == 3

    asyncio.run(scenario())


def test_future_date_partial_confirmations_and_archived_readonly(test_database_url):
    async def scenario():
        async with environment(test_database_url, future=True) as (
            client,
            factory,
            base,
            path,
            actors,
        ):
            item = (await payout_items(client, path))[0]
            target = "/api/v1/payouts/" + item["id"]
            await fund_turn(client, path, item, actors, last_only=True)
            partial = (await client.get(target)).json()
            assert (
                partial["available_amount"] == "12.35"
                and partial["status"] == "pending"
            )
            # Fund remaining entries, then an unmet date must still prevent approval.
            entries = (await client.get(path + "/contributions")).json()["items"]
            for entry in entries:
                if entry["turn_id"] == item["turn_id"] and entry["status"] == "pending":
                    ep = "/api/v1/contributions/" + entry["id"]
                    assert (
                        await client.post(
                            ep + "/declare",
                            headers={"X-Actor": actors[entry["membership_id"]]},
                            json={},
                        )
                    ).status_code == 200
                    assert (await client.post(ep + "/confirm")).status_code == 200
            assert (await client.post(target + "/refresh-readiness")).json()[
                "status"
            ] == "pending"
            assert (
                await client.post(
                    target + "/approve", json={"approved_amount": "49.40"}
                )
            ).status_code == 409
            # Archive through the public endpoint and ensure every relevant mutation is blocked.
            archived = await client.post(base + "/archive")
            assert archived.status_code == 200, archived.text
            assert (await client.post(target + "/refresh-readiness")).status_code == 409
            assert (await client.post(path + "/payouts/generate")).status_code == 409
            assert (await client.post(path + "/cancel")).status_code == 409
            remaining = next(e for e in entries if e["turn_id"] != item["turn_id"])
            assert (
                await client.post(
                    "/api/v1/contributions/" + remaining["id"] + "/declare",
                    headers={"X-Actor": actors[remaining["membership_id"]]},
                    json={},
                )
            ).status_code == 409
            assert (await client.get(target)).status_code == 200

    asyncio.run(scenario())


def test_database_constraints_and_missing_obligation(test_database_url):
    async def scenario():
        async with environment(test_database_url) as (
            client,
            factory,
            base,
            path,
            actors,
        ):
            item = (await payout_items(client, path))[0]
            await fund_turn(client, path, item, actors)
            async with factory() as session:
                entry = await session.scalar(
                    select(Contribution).where(
                        Contribution.turn_id == UUID(item["turn_id"])
                    )
                )
                await session.delete(entry)
                await session.commit()
            target = "/api/v1/payouts/" + item["id"]
            assert (await client.post(target + "/refresh-readiness")).json()[
                "status"
            ] == "pending"
            assert (
                await client.post(
                    target + "/approve", json={"approved_amount": "49.40"}
                )
            ).status_code == 409
            for values in [
                {"beneficiary_membership_id": uuid4()},
                {"tontine_id": uuid4()},
                {"available_amount": Decimal("1000")},
                {"status": "received"},
            ]:
                async with factory() as session:
                    with pytest.raises(IntegrityError):
                        await session.execute(
                            update(Payout)
                            .where(Payout.id == UUID(item["id"]))
                            .values(**values)
                        )
                        await session.commit()
                    await session.rollback()

    asyncio.run(scenario())


def test_catchup_and_confirm_cancel_race(test_database_url):
    async def scenario():
        async with environment(test_database_url) as (
            client,
            factory,
            base,
            path,
            actors,
        ):
            # Simulate a pre-Sprint-6 cycle: no payouts yet.
            async with factory() as session:
                await session.execute(delete(Payout))
                await session.commit()
            generated = await asyncio.gather(
                client.post(path + "/payouts/generate"),
                client.post(path + "/payouts/generate"),
            )
            assert [r.status_code for r in generated] == [200, 200]
            items = await payout_items(client, path)
            assert len(items) == 4
            item = items[0]
            target = "/api/v1/payouts/" + item["id"]
            entries = (await client.get(path + "/contributions")).json()["items"]
            entries = [
                entry for entry in entries if entry["turn_id"] == item["turn_id"]
            ]
            for entry in entries:
                ep = "/api/v1/contributions/" + entry["id"]
                assert (
                    await client.post(
                        ep + "/declare",
                        headers={"X-Actor": actors[entry["membership_id"]]},
                        json={},
                    )
                ).status_code == 200
            # Two confirmations must update availability without a lost update.
            confirmed = await asyncio.gather(
                *(
                    client.post("/api/v1/contributions/" + entry["id"] + "/confirm")
                    for entry in entries[:-1]
                )
            )
            assert all(r.status_code == 200 for r in confirmed)
            final_confirmation, cancelled = await asyncio.gather(
                client.post("/api/v1/contributions/" + entries[-1]["id"] + "/confirm"),
                client.post(
                    target + "/cancel", json={"reason": "Annulé avant transfert"}
                ),
            )
            assert final_confirmation.status_code == cancelled.status_code == 200
            final = (await client.get(target)).json()
            assert (
                final["status"] == "cancelled" and final["available_amount"] == "49.40"
            )
            # A refresh cannot resurrect an intentionally cancelled payout.
            assert (await client.post(target + "/refresh-readiness")).json()[
                "status"
            ] == "cancelled"

    asyncio.run(scenario())


def test_activation_rolls_back_all_generated_data(test_database_url, monkeypatch):
    from sqlalchemy import func

    from app.modules.cycles.models import Cycle
    from app.modules.payouts import services

    async def scenario():
        async with environment(test_database_url) as (
            client,
            factory,
            base,
            path,
            actors,
        ):
            assert (await client.post(path + "/cancel")).status_code == 200
            cycle = await client.post(
                base + "/cycles",
                json={
                    "name": "Activation atomique",
                    "contribution_amount": "15.00",
                    "frequency": "weekly",
                    "start_date": "2020-01-01",
                },
            )
            cycle_id = UUID(cycle.json()["id"])
            new_path = base + "/cycles/" + str(cycle_id)
            for suffix in ["/turns/generate", "/schedule"]:
                assert (await client.post(new_path + suffix)).status_code == 200

            async def failure(session, cycle):
                raise services.PayoutError("Erreur simulée après cotisations", 409)

            monkeypatch.setattr(services, "generate_for_cycle", failure)
            assert (await client.post(new_path + "/activate")).status_code == 409
            async with factory() as session:
                saved = await session.get(Cycle, cycle_id)
                assert saved.status.value == "scheduled" and saved.activated_at is None
                assert (
                    await session.scalar(
                        select(func.count())
                        .select_from(Contribution)
                        .where(Contribution.cycle_id == cycle_id)
                    )
                    == 0
                )
                assert (
                    await session.scalar(
                        select(func.count())
                        .select_from(Payout)
                        .where(Payout.cycle_id == cycle_id)
                    )
                    == 0
                )

    asyncio.run(scenario())


def test_same_count_different_membership_is_not_a_complete_schedule(test_database_url):
    async def scenario():
        async with environment(test_database_url) as (
            client,
            factory,
            base,
            path,
            actors,
        ):
            assert (await client.post(path + "/cancel")).status_code == 200
            cycle = await client.post(
                base + "/cycles",
                json={
                    "name": "Calendrier figé",
                    "contribution_amount": "15.00",
                    "frequency": "weekly",
                    "start_date": "2020-01-01",
                },
            )
            new_path = base + "/cycles/" + cycle.json()["id"]
            assert (await client.post(new_path + "/turns/generate")).status_code == 200
            assert (await client.post(new_path + "/schedule")).status_code == 200
            assert (
                await client.post(
                    base + "/members/me/leave", headers={"X-Actor": "member"}
                )
            ).status_code == 200
            invitation = await client.post(
                base + "/invitations", json={"email": "replacement@example.com"}
            )
            accepted = await client.post(
                "/api/v1/invitations/accept",
                headers={"X-Actor": "replacement"},
                json={"token": invitation.json()["token"]},
            )
            assert accepted.status_code == 200
            assert (
                await client.post(new_path + "/contributions/generate")
            ).status_code == 409
            assert (await client.post(new_path + "/activate")).status_code == 409

    asyncio.run(scenario())
