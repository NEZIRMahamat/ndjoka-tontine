import asyncio
from decimal import Decimal

import httpx2 as httpx
import pytest
from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.auth0 import get_current_token_payload
from app.db.session import build_session_factory, get_db_session
from app.main import app
from app.modules.contributions.enums import ContributionStatus
from app.modules.contributions.models import Contribution
from app.modules.cycles.models import Cycle, CycleTurn
from app.schemas.auth import TokenPayload

pytestmark = pytest.mark.integration


def test_cycle_and_contribution_http_lifecycle(test_database_url):
    async def scenario():
        engine = create_async_engine(test_database_url, poolclass=NullPool)
        factory = build_session_factory(engine)

        async def session_dependency():
            async with factory() as session:
                yield session

        def token_dependency(request: Request):
            subject = request.headers.get("X-Test-Subject", "auth0|owner-cycle")
            email = request.headers.get("X-Test-Email", "cycle-owner@example.com")
            return TokenPayload(
                sub=subject,
                email=email,
                iss="https://test.auth0.com/",
                aud="test",
                exp=4102444800,
                iat=1700000000,
            )

        owner = {
            "X-Test-Subject": "auth0|owner-cycle",
            "X-Test-Email": "cycle-owner@example.com",
        }
        member = {
            "X-Test-Subject": "auth0|member-cycle",
            "X-Test-Email": "cycle-member@example.com",
        }
        app.dependency_overrides[get_db_session] = session_dependency
        app.dependency_overrides[get_current_token_payload] = token_dependency
        try:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test"
            ) as client:
                created = await client.post(
                    "/api/v1/tontines",
                    headers=owner,
                    json={"name": "Cycle intégré", "max_members": 2},
                )
                assert created.status_code == 201
                tontine_id = created.json()["id"]
                base = f"/api/v1/tontines/{tontine_id}"

                invitation = await client.post(
                    base + "/invitations",
                    headers=owner,
                    json={"email": "cycle-member@example.com"},
                )
                assert invitation.status_code == 201
                accepted = await client.post(
                    "/api/v1/invitations/accept",
                    headers=member,
                    json={"token": invitation.json()["token"]},
                )
                assert accepted.status_code == 200

                denied = await client.post(
                    base + "/cycles",
                    headers=member,
                    json={
                        "name": "Cycle refusé",
                        "contribution_amount": "40.00",
                        "frequency": "weekly",
                        "start_date": "2027-01-10",
                    },
                )
                assert denied.status_code == 403
                cycle_response = await client.post(
                    base + "/cycles",
                    headers=owner,
                    json={
                        "name": "Cycle 2027",
                        "contribution_amount": "125.50",
                        "frequency": "weekly",
                        "start_date": "2027-01-10",
                        "timezone": "Europe/Paris",
                        "beneficiary_contributes": True,
                    },
                )
                assert cycle_response.status_code == 201
                cycle_id = cycle_response.json()["id"]
                cycle_base = base + f"/cycles/{cycle_id}"

                generated = await client.post(
                    cycle_base + "/turns/generate", headers=owner
                )
                assert generated.status_code == 200
                turns = generated.json()["turns"]
                assert len(turns) == 2
                assert [turn["position"] for turn in turns] == [1, 2]
                assert len({turn["beneficiary_membership_id"] for turn in turns}) == 2

                reordered = await client.put(
                    cycle_base + "/turns",
                    headers=owner,
                    json={
                        "membership_ids": [
                            turns[1]["beneficiary_membership_id"],
                            turns[0]["beneficiary_membership_id"],
                        ]
                    },
                )
                assert reordered.status_code == 200
                assert (
                    reordered.json()["turns"][0]["beneficiary_membership_id"]
                    == turns[1]["beneficiary_membership_id"]
                )
                assert (
                    await client.post(cycle_base + "/schedule", headers=owner)
                ).status_code == 200
                assert (
                    await client.patch(
                        cycle_base,
                        headers=owner,
                        json={"beneficiary_contributes": False},
                    )
                ).status_code == 409

                activated = await client.post(cycle_base + "/activate", headers=owner)
                assert activated.status_code == 200
                assert activated.json()["status"] == "active"
                contributions_path = cycle_base + "/contributions"
                all_contributions = await client.get(contributions_path, headers=owner)
                assert all_contributions.status_code == 200
                assert all_contributions.json()["total"] == 4
                assert (
                    await client.get(contributions_path, headers=member)
                ).status_code == 403
                assert (
                    await client.post(contributions_path + "/generate", headers=owner)
                ).json()["obligations_total"] == 4

                mine = await client.get("/api/v1/me/contributions", headers=member)
                assert mine.status_code == 200 and mine.json()["total"] == 2
                contribution_id = mine.json()["items"][0]["id"]
                declared = await client.post(
                    f"/api/v1/contributions/{contribution_id}/declare",
                    headers=member,
                    json={
                        "declaration_reference": "MM-2027-0001",
                        "declaration_note": "Versement test",
                    },
                )
                assert (
                    declared.status_code == 200
                    and declared.json()["status"] == "declared"
                )
                assert (
                    await client.post(
                        f"/api/v1/contributions/{contribution_id}/confirm",
                        headers=member,
                    )
                ).status_code == 403
                confirmed = await client.post(
                    f"/api/v1/contributions/{contribution_id}/confirm", headers=owner
                )
                assert (
                    confirmed.status_code == 200
                    and confirmed.json()["amount_due"] == "125.50"
                )
                assert (
                    await client.post(
                        f"/api/v1/contributions/{contribution_id}/confirm",
                        headers=owner,
                    )
                ).status_code == 409

                summary = await client.get(
                    contributions_path + "/summary", headers=owner
                )
                assert summary.status_code == 200
                assert summary.json()["confirmed_count"] == 1
                assert Decimal(summary.json()["confirmed_amount"]) == Decimal("125.50")

                cancelled = await client.post(cycle_base + "/cancel", headers=owner)
                assert (
                    cancelled.status_code == 200
                    and cancelled.json()["status"] == "cancelled"
                )
                after_cancel = await client.get(contributions_path, headers=owner)
                statuses = [item["status"] for item in after_cancel.json()["items"]]
                assert statuses.count("confirmed") == 1
                assert statuses.count("cancelled") == 3

                second = await client.post(
                    base + "/cycles",
                    headers=owner,
                    json={
                        "name": "Sans bénéficiaire",
                        "contribution_amount": "20.00",
                        "frequency": "monthly",
                        "start_date": "2027-02-28",
                        "beneficiary_contributes": False,
                    },
                )
                second_id = second.json()["id"]
                second_base = base + f"/cycles/{second_id}"
                assert (
                    await client.post(second_base + "/turns/generate", headers=owner)
                ).status_code == 200
                assert (
                    await client.post(second_base + "/schedule", headers=owner)
                ).status_code == 200
                concurrent_generation = await asyncio.gather(
                    client.post(second_base + "/contributions/generate", headers=owner),
                    client.post(second_base + "/contributions/generate", headers=owner),
                )
                assert [response.status_code for response in concurrent_generation] == [
                    200,
                    200,
                ]
                assert {
                    response.json()["obligations_total"]
                    for response in concurrent_generation
                } == {2}
                assert (
                    await client.post(second_base + "/activate", headers=owner)
                ).status_code == 200
                second_items = await client.get(
                    second_base + "/contributions", headers=owner
                )
                assert second_items.json()["total"] == 2
                assert (
                    await client.post(second_base + "/complete", headers=owner)
                ).status_code == 200

            async with factory() as session:
                assert (
                    await session.scalar(select(func.count()).select_from(Cycle)) == 2
                )
                assert (
                    await session.scalar(select(func.count()).select_from(CycleTurn))
                    == 4
                )
                assert (
                    await session.scalar(select(func.count()).select_from(Contribution))
                    == 6
                )
                assert (
                    await session.scalar(
                        select(func.count())
                        .select_from(Contribution)
                        .where(Contribution.status == ContributionStatus.CONFIRMED)
                    )
                    == 1
                )
        finally:
            app.dependency_overrides.clear()
            await engine.dispose()

    asyncio.run(scenario())
