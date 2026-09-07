import asyncio
from datetime import UTC, datetime
from uuid import uuid4

import httpx2 as httpx
import pytest
from fastapi import Request
from sqlalchemy import delete, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.auth0 import get_current_token_payload
from app.db.session import build_session_factory, get_db_session
from app.main import app
from app.modules.tontines import services
from app.modules.tontines.enums import TontineStatus
from app.modules.tontines.models import Tontine
from app.modules.tontines.repositories import find_accessible_tontine
from app.modules.tontines.schemas import TontineCreate, TontineUpdate
from app.modules.users.enums import UserStatus
from app.modules.users.models import User
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


def test_tontine_http_lifecycle_with_real_postgresql(test_database_url):
    async def scenario(engine, factory):
        async def session_dependency():
            async with factory() as session:
                yield session

        def token_dependency(request: Request):
            # Only JWT verification is stubbed; provisioning and account guards use PG.
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
                created = await client.post(
                    "/api/v1/tontines", json={"name": "Projet famille"}
                )
                assert created.status_code == 201
                row = created.json()
                path = f"/api/v1/tontines/{row['id']}"
                assert row["status"] == "draft" and row["currency"] == "EUR"
                assert row["created_at"].endswith("Z")
                assert (await client.get(path)).json()["name"] == "Projet famille"
                assert (await client.get("/api/v1/tontines")).json()["total"] == 1
                other = {"X-Test-Subject": "auth0|other"}
                assert (await client.get("/api/v1/tontines", headers=other)).json()[
                    "total"
                ] == 0
                assert (await client.get(path, headers=other)).status_code == 404
                assert (
                    await client.patch(path, headers=other, json={"name": "Intrusion"})
                ).status_code == 404
                assert (
                    await client.post(path + "/archive", headers=other)
                ).status_code == 404
                assert (await client.patch(path, json={})).status_code == 400
                assert (
                    await client.patch(path, json={"status": "active"})
                ).status_code == 422
                changed = await client.patch(
                    path,
                    json={
                        "currency": "XAF",
                        "max_members": 8,
                        "description": "Objectif",
                    },
                )
                assert (
                    changed.status_code == 200 and changed.json()["currency"] == "XAF"
                )
                cleared = await client.patch(
                    path, json={"max_members": None, "description": None}
                )
                assert (
                    cleared.json()["max_members"] is None
                    and cleared.json()["description"] is None
                )
                archived = await client.post(path + "/archive")
                assert archived.status_code == 200 and archived.json()["archived_at"]
                assert (await client.post(path + "/archive")).json()[
                    "archived_at"
                ] == archived.json()["archived_at"]
                assert (
                    await client.patch(path, json={"name": "Interdit"})
                ).status_code == 409
                assert (await client.get(path)).status_code == 200
                assert (await client.get("/api/v1/tontines?status=archived")).json()[
                    "total"
                ] == 1
                assert (await client.get("/api/v1/tontines?status=draft")).json()[
                    "total"
                ] == 0
                async with factory() as session:
                    owner = await get_or_create_user_by_auth0_sub(
                        session, "auth0|owner"
                    )
                    owner.status = UserStatus.SUSPENDED
                    await session.commit()
                assert (await client.get(path)).status_code == 403
                assert (
                    await client.post("/api/v1/tontines", json={"name": "Interdit"})
                ).status_code == 403
        finally:
            app.dependency_overrides.clear()

    run_scenario(test_database_url, scenario)


def test_tontine_pagination_and_active_currency(test_database_url):
    async def scenario(engine, factory):
        async with factory() as session:
            owner = await get_or_create_user_by_auth0_sub(session, "auth0|owner")
            rows = [
                await services.create_tontine(
                    session, owner, TontineCreate(name=f"Tontine {i}")
                )
                for i in range(3)
            ]
            first, total = await services.list_tontines(
                session, owner, limit=2, offset=0
            )
            second, _ = await services.list_tontines(session, owner, limit=2, offset=2)
            assert total == 3 and len(first) == 2 and len(second) == 1
            assert {row.id for row in first}.isdisjoint(row.id for row in second)
            rows[0].status = TontineStatus.ACTIVE
            await session.commit()
            with pytest.raises(services.TontineError) as conflict:
                await services.update_tontine(
                    session, owner, rows[0].id, TontineUpdate(currency="USD")
                )
            assert conflict.value.status_code == 409
        async with factory() as session:
            persisted = await session.scalar(
                select(Tontine).where(Tontine.status == "active")
            )
            assert persisted.currency == "EUR"

    run_scenario(test_database_url, scenario)


@pytest.mark.parametrize(
    "values",
    [
        {"name": "x"},
        {"max_members": 1},
        {"currency": "eur"},
        {"status": "archived", "archived_at": None},
        {"status": "draft", "archived_at": datetime.now(UTC)},
        {"created_by_user_id": uuid4()},
    ],
)
def test_tontine_database_constraints(test_database_url, values):
    async def scenario(engine, factory):
        async with factory() as session:
            owner = await get_or_create_user_by_auth0_sub(session, "auth0|owner")
            params = {"name": "Famille", "created_by_user_id": owner.id, **values}
            # Raw SQL also exercises constraints independently from ORM validation.
            columns = ", ".join(params)
            placeholders = ", ".join(f":{key}" for key in params)
            with pytest.raises(IntegrityError):
                await session.execute(
                    text(f"INSERT INTO tontines ({columns}) VALUES ({placeholders})"),
                    params,
                )
            await session.rollback()

    run_scenario(test_database_url, scenario)


def test_creator_deletion_restricted_and_index_present(test_database_url):
    async def scenario(engine, factory):
        async with factory() as session:
            owner = await get_or_create_user_by_auth0_sub(session, "auth0|owner")
            await services.create_tontine(session, owner, TontineCreate(name="Famille"))
            with pytest.raises(IntegrityError):
                await session.execute(delete(User).where(User.id == owner.id))
            await session.rollback()
        async with engine.connect() as connection:
            indexes = await connection.run_sync(
                lambda conn: inspect(conn).get_indexes("tontines")
            )
            assert any(
                item["column_names"] == ["created_by_user_id", "created_at", "id"]
                for item in indexes
            )

    run_scenario(test_database_url, scenario)


def test_concurrent_archive_blocks_then_rejects_patch(test_database_url):
    async def scenario(engine, factory):
        async with factory() as session:
            owner = await get_or_create_user_by_auth0_sub(session, "auth0|owner")
            tontine = await services.create_tontine(
                session, owner, TontineCreate(name="Famille")
            )
            owner_id, tontine_id = owner.id, tontine.id
        async with factory() as locking, factory() as updating:
            row = await find_accessible_tontine(
                locking, tontine_id, owner_id, lock=True
            )
            actor = await updating.get(User, owner_id)
            task = asyncio.create_task(
                services.update_tontine(
                    updating, actor, tontine_id, TontineUpdate(name="Interdit")
                )
            )
            try:
                with pytest.raises(TimeoutError):
                    await asyncio.wait_for(asyncio.shield(task), timeout=0.1)
                row.status = TontineStatus.ARCHIVED
                row.archived_at = datetime.now(UTC)
                await locking.commit()
                with pytest.raises(services.TontineError) as conflict:
                    await asyncio.wait_for(task, timeout=5)
                assert conflict.value.status_code == 409
            finally:
                if not task.done():
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
        async with factory() as session:
            row = await session.get(Tontine, tontine_id)
            assert row.name == "Famille" and row.status == TontineStatus.ARCHIVED

    run_scenario(test_database_url, scenario)
