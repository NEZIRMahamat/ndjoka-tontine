import asyncio
from uuid import uuid4

import httpx2 as httpx
import pytest
from fastapi import Request
from sqlalchemy import delete, func, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.auth0 import get_current_token_payload
from app.core.request_context import request_id_context
from app.db.session import build_session_factory, get_db_session
from app.main import app
from app.modules.audit.models import AuditEvent
from app.modules.audit.services import change, record
from app.modules.memberships.enums import MembershipRole, MembershipStatus
from app.modules.memberships.models import Membership
from app.modules.tontines import services as tontine_services
from app.modules.tontines.schemas import TontineCreate
from app.modules.users.enums import GlobalRole
from app.modules.users.services import get_or_create_user_by_auth0_sub
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


def test_audit_is_append_only_and_idempotent(test_database_url):
    async def scenario(_engine, factory):
        async with factory() as session:
            owner = await get_or_create_user_by_auth0_sub(session, "auth0|owner")
            tontine = await tontine_services.create_tontine(
                session, owner, TontineCreate(name="Audit famille")
            )
            await tontine_services.archive_tontine(session, owner, tontine.id)
            await tontine_services.archive_tontine(session, owner, tontine.id)

            events = list(
                await session.scalars(
                    select(AuditEvent).order_by(AuditEvent.occurred_at)
                )
            )
            assert [item.event_name for item in events] == [
                "tontine.created",
                "tontine.archived",
            ]
            event_id = events[0].id
            events[0].changes = {"status": {"to": "tampered"}}
            with pytest.raises(DBAPIError):
                await session.commit()
            await session.rollback()

            with pytest.raises(DBAPIError):
                await session.execute(
                    delete(AuditEvent).where(AuditEvent.id == event_id)
                )
            await session.rollback()
            assert await session.get(AuditEvent, event_id) is not None

    run_scenario(test_database_url, scenario)


def test_audit_failure_rolls_back_business_mutation(test_database_url, monkeypatch):
    async def scenario(_engine, factory):
        async with factory() as session:
            owner = await get_or_create_user_by_auth0_sub(session, "auth0|owner")

            async def fail_audit(*_args, **_kwargs):
                raise RuntimeError("audit unavailable")

            monkeypatch.setattr(tontine_services, "record", fail_audit)
            with pytest.raises(RuntimeError, match="audit unavailable"):
                await tontine_services.create_tontine(
                    session, owner, TontineCreate(name="Must roll back")
                )

            assert (
                await session.scalar(select(func.count()).select_from(AuditEvent)) == 0
            )
            assert (
                await session.scalar(
                    select(func.count()).select_from(tontine_services.Tontine)
                )
                == 0
            )

    run_scenario(test_database_url, scenario)


def test_audit_http_permissions_filters_and_cursor(test_database_url):
    async def scenario(_engine, factory):
        async with factory() as session:
            owner = await get_or_create_user_by_auth0_sub(session, "auth0|owner")
            manager = await get_or_create_user_by_auth0_sub(session, "auth0|manager")
            treasurer = await get_or_create_user_by_auth0_sub(
                session, "auth0|treasurer"
            )
            member = await get_or_create_user_by_auth0_sub(session, "auth0|member")
            await get_or_create_user_by_auth0_sub(session, "auth0|outsider")
            admin = await get_or_create_user_by_auth0_sub(session, "auth0|admin")
            admin.global_role = GlobalRole.PLATFORM_ADMIN
            await session.commit()
            tontine = await tontine_services.create_tontine(
                session, owner, TontineCreate(name="Audit permissions")
            )
            for user, role in (
                (manager, MembershipRole.MANAGER),
                (treasurer, MembershipRole.TREASURER),
                (member, MembershipRole.MEMBER),
            ):
                session.add(
                    Membership(
                        tontine_id=tontine.id,
                        user_id=user.id,
                        role=role,
                        status=MembershipStatus.ACTIVE,
                    )
                )
            await session.flush()
            request_id = uuid4()
            context_token = request_id_context.set(request_id)
            try:
                await record(
                    session,
                    event_name="contribution.confirmed",
                    actor_user_id=owner.id,
                    subject_user_id=member.id,
                    tontine_id=tontine.id,
                    resource_type="contribution",
                    resource_id=uuid4(),
                    changes={"status": change("declared", "confirmed")},
                )
                await record(
                    session,
                    event_name="tontine.updated",
                    actor_user_id=owner.id,
                    subject_user_id=owner.id,
                    tontine_id=tontine.id,
                    resource_type="tontine",
                    resource_id=tontine.id,
                    changes={"name": change("Before", "After")},
                )
                await session.commit()
            finally:
                request_id_context.reset(context_token)
            tontine_id = tontine.id

        async def session_dependency():
            async with factory() as session:
                yield session

        def token_dependency(request: Request):
            return TokenPayload(
                sub=request.headers.get("X-Test-Subject", "auth0|owner"),
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
                path = f"/api/v1/tontines/{tontine_id}/audit-events"
                owner_page = await client.get(path + "?limit=1")
                assert owner_page.status_code == 200
                assert len(owner_page.json()["items"]) == 1
                cursor = owner_page.json()["next_cursor"]
                assert cursor
                next_page = await client.get(
                    path, params={"limit": 1, "cursor": cursor}
                )
                assert next_page.status_code == 200
                assert (
                    next_page.json()["items"][0]["id"]
                    != owner_page.json()["items"][0]["id"]
                )

                filtered = await client.get(
                    path, params={"event_name": "contribution.confirmed"}
                )
                assert [item["event_name"] for item in filtered.json()["items"]] == [
                    "contribution.confirmed"
                ]
                assert filtered.json()["items"][0]["request_id"] == str(request_id)

                manager_page = await client.get(
                    path, headers={"X-Test-Subject": "auth0|manager"}
                )
                assert len(manager_page.json()["items"]) == 3
                treasurer_page = await client.get(
                    path, headers={"X-Test-Subject": "auth0|treasurer"}
                )
                assert [
                    item["event_name"] for item in treasurer_page.json()["items"]
                ] == ["contribution.confirmed"]
                member_page = await client.get(
                    path, headers={"X-Test-Subject": "auth0|member"}
                )
                assert [item["event_name"] for item in member_page.json()["items"]] == [
                    "contribution.confirmed"
                ]
                assert (
                    await client.get(path, headers={"X-Test-Subject": "auth0|outsider"})
                ).status_code == 404

                assert (
                    await client.get(
                        "/api/v1/admin/audit-events",
                        headers={"X-Test-Subject": "auth0|owner"},
                    )
                ).status_code == 403
                global_page = await client.get(
                    "/api/v1/admin/audit-events",
                    headers={"X-Test-Subject": "auth0|admin"},
                )
                assert global_page.status_code == 200
                assert len(global_page.json()["items"]) == 3
        finally:
            app.dependency_overrides.clear()

    run_scenario(test_database_url, scenario)
