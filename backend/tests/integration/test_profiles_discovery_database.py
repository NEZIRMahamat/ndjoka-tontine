import asyncio
from datetime import UTC, date, datetime, timedelta

import httpx2 as httpx
import pytest
from fastapi import Request
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.auth0 import get_current_token_payload
from app.db.session import build_session_factory, get_db_session
from app.main import app
from app.modules.contributions.enums import ContributionStatus
from app.modules.contributions.models import Contribution
from app.modules.cycles.enums import CycleFrequency, CycleStatus
from app.modules.cycles.models import Cycle, CycleTurn
from app.modules.memberships.enums import MembershipRole, MembershipStatus
from app.modules.memberships.models import Membership
from app.modules.profiles.reliability import get_reliability
from app.modules.tontines.enums import TontineStatus
from app.modules.tontines.models import Tontine
from app.modules.users.services import get_or_create_user_by_auth0_sub
from app.schemas.auth import TokenPayload

pytestmark = pytest.mark.integration

VALID_PROFILE = {
    "monthly_capacity": "200.00",
    "preferred_rhythm": "monthly",
    "savings_goal": "project",
    "horizon_months": 10,
    "group_size_preference": "medium",
    "experience_level": "beginner",
    "turn_preference": "flexible",
}


def run_scenario(database_url, scenario):
    async def run():
        engine = create_async_engine(database_url, poolclass=NullPool)
        try:
            await scenario(engine, build_session_factory(engine))
        finally:
            await engine.dispose()

    asyncio.run(run())


def _overrides(factory):
    async def session_dependency():
        async with factory() as session:
            yield session

    def token_dependency(request: Request):
        return TokenPayload(
            sub=request.headers.get("X-Test-Subject", "auth0|saver"),
            iss="https://test.auth0.com/",
            aud="test",
            exp=4102444800,
            iat=1700000000,
        )

    app.dependency_overrides[get_db_session] = session_dependency
    app.dependency_overrides[get_current_token_payload] = token_dependency


def test_saver_profile_http_lifecycle(test_database_url):
    async def scenario(engine, factory):
        _overrides(factory)
        try:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test"
            ) as client:
                assert (
                    await client.get("/api/v1/me/saver-profile")
                ).status_code == 404

                saved = await client.put(
                    "/api/v1/me/saver-profile", json=VALID_PROFILE
                )
                assert saved.status_code == 200
                assert saved.json()["savings_goal"] == "project"

                read = await client.get("/api/v1/me/saver-profile")
                assert read.status_code == 200
                assert read.json()["horizon_months"] == 10

                updated = await client.put(
                    "/api/v1/me/saver-profile",
                    json={**VALID_PROFILE, "horizon_months": 24},
                )
                assert updated.json()["horizon_months"] == 24

                assert (
                    await client.put(
                        "/api/v1/me/saver-profile",
                        json={**VALID_PROFILE, "savings_goal": "vacances"},
                    )
                ).status_code == 422
                assert (
                    await client.put(
                        "/api/v1/me/saver-profile",
                        json={**VALID_PROFILE, "monthly_capacity": "0"},
                    )
                ).status_code == 422
                assert (
                    await client.put(
                        "/api/v1/me/saver-profile",
                        json={**VALID_PROFILE, "unknown": 1},
                    )
                ).status_code == 422

                assert (
                    await client.delete("/api/v1/me/saver-profile")
                ).status_code == 204
                assert (
                    await client.get("/api/v1/me/saver-profile")
                ).status_code == 404

                # Le profil est strictement personnel.
                other = {"X-Test-Subject": "auth0|other"}
                await client.put(
                    "/api/v1/me/saver-profile", json=VALID_PROFILE, headers=other
                )
                assert (
                    await client.get("/api/v1/me/saver-profile")
                ).status_code == 404
        finally:
            app.dependency_overrides.clear()

    run_scenario(test_database_url, scenario)


def test_reliability_reflects_contribution_history(test_database_url):
    async def scenario(engine, factory):
        now = datetime.now(UTC)
        async with factory() as session:
            saver = await get_or_create_user_by_auth0_sub(session, "auth0|saver")
            tontine = Tontine(
                name="Épargne projet",
                currency="EUR",
                status=TontineStatus.ACTIVE,
                created_by_user_id=saver.id,
            )
            session.add(tontine)
            await session.flush()
            membership = Membership(
                tontine_id=tontine.id,
                user_id=saver.id,
                role=MembershipRole.OWNER,
                status=MembershipStatus.ACTIVE,
            )
            session.add(membership)
            await session.flush()

            # Un tour par cycle : un bénéficiaire ne peut recevoir qu'une fois.
            cycles = [
                Cycle(
                    tontine_id=tontine.id,
                    sequence_number=sequence,
                    name=f"Cycle {sequence}",
                    contribution_amount="100.00",
                    frequency=CycleFrequency.MONTHLY,
                    start_date=date(2025, 1, 1),
                    status=CycleStatus.DRAFT,
                    created_by_user_id=saver.id,
                )
                for sequence in range(1, 5)
            ]
            session.add_all(cycles)
            await session.flush()

            turns = [
                CycleTurn(
                    cycle_id=cycle.id,
                    position=1,
                    beneficiary_membership_id=membership.id,
                    scheduled_for=now + timedelta(days=30),
                )
                for cycle in cycles
            ]
            session.add_all(turns)
            await session.flush()

            def contribution(index, due_offset, **extra):
                return Contribution(
                    cycle_id=cycles[index].id,
                    turn_id=turns[index].id,
                    membership_id=membership.id,
                    amount_due="100.00",
                    due_at=now + timedelta(days=due_offset),
                    **extra,
                )

            def settled(index, due_offset, paid_offset):
                paid_at = now + timedelta(days=paid_offset)
                return contribution(
                    index,
                    due_offset,
                    status=ContributionStatus.CONFIRMED,
                    declared_at=paid_at,
                    confirmed_at=paid_at,
                    confirmed_by_user_id=saver.id,
                )

            session.add_all(
                [
                    settled(0, -30, -31),  # réglée en avance
                    settled(1, -20, -10),  # réglée en retard
                    contribution(2, -5, status=ContributionStatus.PENDING),  # impayée
                    contribution(3, 25, status=ContributionStatus.PENDING),  # à venir
                ]
            )
            await session.commit()
            saver_id = saver.id

        async with factory() as session:
            reliability = await get_reliability(session, saver_id)

        # L'échéance future n'entre pas dans le calcul.
        assert reliability.contributions_total == 3
        assert reliability.contributions_on_time == 1
        assert reliability.contributions_late == 1
        assert reliability.contributions_outstanding == 1
        assert reliability.cycles_completed == 0
        assert reliability.is_provisional is True
        assert 0 <= reliability.score <= 1

    run_scenario(test_database_url, scenario)


def test_discovery_excludes_joined_and_ranks_by_affinity(test_database_url):
    async def scenario(engine, factory):
        async with factory() as session:
            saver = await get_or_create_user_by_auth0_sub(session, "auth0|saver")
            owner = await get_or_create_user_by_auth0_sub(session, "auth0|owner")

            def build(name, amount, frequency, *, discoverable=True, gate=None):
                tontine = Tontine(
                    name=name,
                    currency="EUR",
                    max_members=10,
                    status=TontineStatus.ACTIVE,
                    is_discoverable=discoverable,
                    min_reliability_score=gate,
                    created_by_user_id=owner.id,
                )
                session.add(tontine)
                return tontine, amount, frequency

            aligned = build("Tontine alignée", "140.00", CycleFrequency.MONTHLY)
            costly = build("Tontine coûteuse", "800.00", CycleFrequency.MONTHLY)
            hidden = build(
                "Tontine privée", "140.00", CycleFrequency.MONTHLY, discoverable=False
            )
            gated = build(
                "Tontine exigeante", "140.00", CycleFrequency.MONTHLY, gate="0.990"
            )
            joined = build("Tontine rejointe", "140.00", CycleFrequency.MONTHLY)
            await session.flush()

            for index, (tontine, amount, frequency) in enumerate(
                [aligned, costly, hidden, gated, joined], start=1
            ):
                session.add_all(
                    [
                        Membership(
                            tontine_id=tontine.id,
                            user_id=owner.id,
                            role=MembershipRole.OWNER,
                            status=MembershipStatus.ACTIVE,
                        ),
                        Cycle(
                            tontine_id=tontine.id,
                            sequence_number=1,
                            name=f"Cycle {index}",
                            contribution_amount=amount,
                            frequency=frequency,
                            start_date=date(2025, 1, 1),
                            status=CycleStatus.ACTIVE,
                            activated_at=datetime.now(UTC),
                            created_by_user_id=owner.id,
                        ),
                    ]
                )
            session.add(
                Membership(
                    tontine_id=joined[0].id,
                    user_id=saver.id,
                    role=MembershipRole.MEMBER,
                    status=MembershipStatus.ACTIVE,
                )
            )
            await session.commit()
            hidden_id = str(hidden[0].id)

        _overrides(factory)
        try:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test"
            ) as client:
                await client.put("/api/v1/me/saver-profile", json=VALID_PROFILE)
                body = (await client.get("/api/v1/discovery/tontines")).json()
                names = [item["name"] for item in body["items"]]

                assert body["has_profile"] is True
                assert "Tontine rejointe" not in names
                assert "Tontine privée" not in names
                assert names[0] == "Tontine alignée"
                assert set(names) == {
                    "Tontine alignée",
                    "Tontine coûteuse",
                    "Tontine exigeante",
                }

                top = body["items"][0]
                assert top["is_eligible"] is True
                assert top["monthly_equivalent"] == "140.00"
                assert top["seats_left"] == 9
                assert any(reason["matched"] for reason in top["reasons"])

                gated_item = next(
                    item for item in body["items"] if item["name"] == "Tontine exigeante"
                )
                assert gated_item["is_eligible"] is False
                assert gated_item["ineligibility_reason"]

                filtered = (
                    await client.get("/api/v1/discovery/tontines?eligible_only=true")
                ).json()
                assert "Tontine exigeante" not in [
                    item["name"] for item in filtered["items"]
                ]

                searched = (
                    await client.get("/api/v1/discovery/tontines?search=coûteuse")
                ).json()
                assert [item["name"] for item in searched["items"]] == [
                    "Tontine coûteuse"
                ]

                # Adhésion directe : autorisée sur une tontine ouverte,
                # refusée quand le score exigé n'est pas atteint.
                gated_id = gated_item["id"]
                refused = await client.post(
                    f"/api/v1/discovery/tontines/{gated_id}/join"
                )
                assert refused.status_code == 403

                joined_response = await client.post(
                    f"/api/v1/discovery/tontines/{top['id']}/join"
                )
                assert joined_response.status_code == 201
                assert joined_response.json()["role"] == "member"

                assert (
                    await client.post(f"/api/v1/discovery/tontines/{top['id']}/join")
                ).status_code == 409

                after = (await client.get("/api/v1/discovery/tontines")).json()
                assert "Tontine alignée" not in [
                    item["name"] for item in after["items"]
                ]

                assert (
                    await client.post(f"/api/v1/discovery/tontines/{hidden_id}/join")
                ).status_code == 404
        finally:
            app.dependency_overrides.clear()

    run_scenario(test_database_url, scenario)
