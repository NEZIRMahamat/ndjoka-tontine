import asyncio
import hashlib
from datetime import UTC, datetime, timedelta

import httpx2 as httpx
import pytest
from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.auth0 import get_current_token_payload
from app.db.session import build_session_factory, get_db_session
from app.main import app
from app.modules.memberships.enums import (
    InvitationStatus,
    MembershipRole,
    MembershipStatus,
)
from app.modules.memberships.models import Invitation, Membership
from app.modules.users.models import User
from app.schemas.auth import TokenPayload

pytestmark = pytest.mark.integration


def run_scenario(database_url, scenario):
    async def run():
        engine = create_async_engine(database_url, poolclass=NullPool)
        try:
            await scenario(engine, build_session_factory(engine))
        finally:
            await engine.dispose()

    asyncio.run(run())


def test_full_membership_http_lifecycle(test_database_url):
    async def scenario(engine, factory):
        async def session_dependency():
            async with factory() as session:
                yield session

        def token_dependency(request: Request):
            subject = request.headers.get("X-Test-Subject", "auth0|owner")
            email = request.headers.get("X-Test-Email", "owner@example.com")
            return TokenPayload(
                sub=subject,
                email=email,
                iss="https://test.auth0.com/",
                aud="test",
                exp=4102444800,
                iat=1700000000,
            )

        owner_headers = {
            "X-Test-Subject": "auth0|owner",
            "X-Test-Email": "owner@example.com",
        }
        member_headers = {
            "X-Test-Subject": "auth0|member",
            "X-Test-Email": "member@example.com",
        }
        outsider_headers = {
            "X-Test-Subject": "auth0|outsider",
            "X-Test-Email": "other@example.com",
        }
        app.dependency_overrides[get_db_session] = session_dependency
        app.dependency_overrides[get_current_token_payload] = token_dependency
        try:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test"
            ) as client:
                created = await client.post(
                    "/api/v1/tontines",
                    headers=owner_headers,
                    json={"name": "Famille ouverte", "max_members": 3},
                )
                assert created.status_code == 201
                tontine_id = created.json()["id"]
                base = f"/api/v1/tontines/{tontine_id}"

                members = await client.get(base + "/members", headers=owner_headers)
                assert members.status_code == 200
                assert members.json()["total"] == 1
                assert members.json()["items"][0]["role"] == "owner"

                invitation = await client.post(
                    base + "/invitations",
                    headers=owner_headers,
                    json={"email": "MEMBER@example.com", "role": "member"},
                )
                assert invitation.status_code == 201
                invitation_body = invitation.json()
                token = invitation_body["token"]
                assert "token_hash" not in invitation_body
                assert invitation_body["email"] == "member@example.com"
                listed = await client.get(base + "/invitations", headers=owner_headers)
                assert listed.json()["total"] == 1
                assert "token" not in listed.json()["items"][0]

                wrong_email = await client.post(
                    "/api/v1/invitations/accept",
                    headers=outsider_headers,
                    json={"token": token},
                )
                assert wrong_email.status_code == 403
                accepted = await client.post(
                    "/api/v1/invitations/accept",
                    headers=member_headers,
                    json={"token": token},
                )
                assert accepted.status_code == 200
                member_id = accepted.json()["user_id"]
                assert accepted.json()["role"] == "member"
                assert (
                    await client.post(
                        "/api/v1/invitations/accept",
                        headers=member_headers,
                        json={"token": token},
                    )
                ).status_code == 409

                assert (
                    await client.get(base, headers=member_headers)
                ).status_code == 200
                assert (
                    await client.get("/api/v1/tontines", headers=member_headers)
                ).json()["total"] == 1
                assert (
                    await client.patch(
                        base, headers=member_headers, json={"name": "Intrusion"}
                    )
                ).status_code == 403

                changed = await client.patch(
                    base + f"/members/{member_id}/role",
                    headers=owner_headers,
                    json={"role": "treasurer"},
                )
                assert (
                    changed.status_code == 200 and changed.json()["role"] == "treasurer"
                )
                assert (
                    await client.post(
                        base + "/invitations",
                        headers=member_headers,
                        json={"email": "third@example.com"},
                    )
                ).status_code == 403

                revoked = await client.post(
                    base + "/invitations",
                    headers=owner_headers,
                    json={"email": "revoked@example.com"},
                )
                revoked_token = revoked.json()["token"]
                revoked_id = revoked.json()["id"]
                assert (
                    await client.post(
                        base + f"/invitations/{revoked_id}/revoke",
                        headers=owner_headers,
                    )
                ).json()["status"] == "revoked"
                assert (
                    await client.post(
                        "/api/v1/invitations/accept",
                        headers={
                            "X-Test-Subject": "auth0|revoked",
                            "X-Test-Email": "revoked@example.com",
                        },
                        json={"token": revoked_token},
                    )
                ).status_code == 409
                assert (
                    await client.post(
                        "/api/v1/invitations/accept",
                        headers=outsider_headers,
                        json={"token": "x" * 43},
                    )
                ).status_code == 400

                removed = await client.post(
                    base + f"/members/{member_id}/remove", headers=owner_headers
                )
                assert (
                    removed.status_code == 200 and removed.json()["status"] == "removed"
                )
                assert (
                    await client.get(base, headers=member_headers)
                ).status_code == 404
                owner_id = members.json()["items"][0]["user_id"]
                assert (
                    await client.post(
                        base + f"/members/{owner_id}/remove", headers=owner_headers
                    )
                ).status_code in {400, 409}
        finally:
            app.dependency_overrides.clear()

    run_scenario(test_database_url, scenario)


def test_expiry_capacity_transfer_and_cross_tontine_isolation(test_database_url):
    async def scenario(engine, factory):
        async def session_dependency():
            async with factory() as session:
                yield session

        def token_dependency(request: Request):
            name = request.headers.get("X-Test-User", "owner")
            return TokenPayload(
                sub=f"auth0|{name}",
                email=f"{name}@example.com",
                iss="https://test.auth0.com/",
                aud="test",
                exp=4102444800,
                iat=1700000000,
            )

        def headers(name):
            return {"X-Test-User": name}

        app.dependency_overrides[get_db_session] = session_dependency
        app.dependency_overrides[get_current_token_payload] = token_dependency
        try:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test"
            ) as client:
                first = await client.post(
                    "/api/v1/tontines",
                    headers=headers("owner"),
                    json={"name": "Première", "max_members": 2},
                )
                first_id = first.json()["id"]
                first_base = f"/api/v1/tontines/{first_id}"
                capacity_invite = await client.post(
                    first_base + "/invitations",
                    headers=headers("owner"),
                    json={"email": "member@example.com"},
                )
                assert (
                    await client.post(
                        "/api/v1/invitations/accept",
                        headers=headers("member"),
                        json={"token": capacity_invite.json()["token"]},
                    )
                ).status_code == 200
                full_invite = await client.post(
                    first_base + "/invitations",
                    headers=headers("owner"),
                    json={"email": "third@example.com"},
                )
                assert (
                    await client.post(
                        "/api/v1/invitations/accept",
                        headers=headers("third"),
                        json={"token": full_invite.json()["token"]},
                    )
                ).status_code == 409

                second = await client.post(
                    "/api/v1/tontines",
                    headers=headers("owner"),
                    json={"name": "Deuxième"},
                )
                second_id = second.json()["id"]
                second_base = f"/api/v1/tontines/{second_id}"
                transfer_invite = await client.post(
                    second_base + "/invitations",
                    headers=headers("owner"),
                    json={"email": "manager@example.com", "role": "manager"},
                )
                accepted = await client.post(
                    "/api/v1/invitations/accept",
                    headers=headers("manager"),
                    json={"token": transfer_invite.json()["token"]},
                )
                manager_id = accepted.json()["user_id"]
                transferred = await client.post(
                    second_base + "/ownership-transfer",
                    headers=headers("owner"),
                    json={"new_owner_user_id": manager_id},
                )
                assert (
                    transferred.status_code == 200
                    and transferred.json()["role"] == "owner"
                )
                assert (
                    await client.patch(
                        second_base + f"/members/{manager_id}/role",
                        headers=headers("owner"),
                        json={"role": "member"},
                    )
                ).status_code == 403
                left = await client.post(
                    second_base + "/members/me/leave", headers=headers("owner")
                )
                assert left.status_code == 200 and left.json()["status"] == "left"
                assert (
                    await client.get(second_base, headers=headers("owner"))
                ).status_code == 404

                cross = await client.get(
                    first_base + "/invitations", headers=headers("manager")
                )
                assert cross.status_code == 404

                expired_token = "expired-token-which-is-long-enough-123456"
                async with factory() as session:
                    owner = await session.scalar(
                        select(User).where(User.auth0_sub == "auth0|owner")
                    )
                    invitation = Invitation(
                        tontine_id=second_id,
                        email="expired@example.com",
                        role=MembershipRole.MEMBER,
                        token_hash=hashlib.sha256(expired_token.encode()).hexdigest(),
                        status=InvitationStatus.PENDING,
                        invited_by_user_id=owner.id,
                        created_at=datetime.now(UTC) - timedelta(days=8),
                        expires_at=datetime.now(UTC) - timedelta(days=1),
                    )
                    session.add(invitation)
                    await session.commit()
                expired = await client.post(
                    "/api/v1/invitations/accept",
                    headers=headers("expired"),
                    json={"token": expired_token},
                )
                assert expired.status_code == 409

                async with factory() as session:
                    active_owners = await session.scalar(
                        select(func.count())
                        .select_from(Membership)
                        .where(
                            Membership.tontine_id == second_id,
                            Membership.role == MembershipRole.OWNER,
                            Membership.status == MembershipStatus.ACTIVE,
                        )
                    )
                    expired_row = await session.scalar(
                        select(Invitation).where(
                            Invitation.token_hash
                            == hashlib.sha256(expired_token.encode()).hexdigest()
                        )
                    )
                    assert active_owners == 1
                    assert expired_row.status == InvitationStatus.EXPIRED
        finally:
            app.dependency_overrides.clear()

    run_scenario(test_database_url, scenario)
