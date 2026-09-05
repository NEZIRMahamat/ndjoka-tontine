import asyncio
from collections.abc import Awaitable, Callable
from pathlib import Path
from uuid import UUID

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import func, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import NullPool

from app.db.session import build_session_factory
from app.modules.users.enums import GlobalRole, UserStatus
from app.modules.users.models import User
from app.modules.users.services import (
    deactivate_user,
    get_or_create_user_by_auth0_sub,
    update_user_global_role,
    update_user_profile,
    update_user_status,
)

pytestmark = pytest.mark.integration
BACKEND_ROOT = Path(__file__).resolve().parents[2]


def run_database_scenario(
    database_url: str,
    scenario: Callable[[AsyncEngine], Awaitable[None]],
) -> None:
    async def run() -> None:
        engine = create_async_engine(database_url, poolclass=NullPool)
        try:
            await scenario(engine)
        finally:
            await engine.dispose()

    asyncio.run(run())


def test_alembic_head_is_applied_to_postgresql_17(
    test_database_url: str,
) -> None:
    expected_head = ScriptDirectory.from_config(
        Config(BACKEND_ROOT / "alembic.ini")
    ).get_current_head()

    async def scenario(engine: AsyncEngine) -> None:
        async with engine.connect() as connection:
            revision = await connection.scalar(
                text("SELECT version_num FROM alembic_version")
            )
            server_version = await connection.scalar(text("SHOW server_version_num"))
            table_names = await connection.run_sync(
                lambda sync_connection: inspect(sync_connection).get_table_names()
            )
            unique_constraints = await connection.run_sync(
                lambda sync_connection: inspect(sync_connection).get_unique_constraints(
                    "users"
                )
            )
            check_constraints = await connection.run_sync(
                lambda sync_connection: inspect(sync_connection).get_check_constraints(
                    "users"
                )
            )
            columns = await connection.run_sync(
                lambda sync_connection: inspect(sync_connection).get_columns("users")
            )

        assert revision == expected_head
        assert int(server_version) // 10_000 == 17
        assert "users" in table_names
        assert {constraint["name"] for constraint in unique_constraints} == {
            "uq_users_auth0_sub"
        }
        assert {constraint["name"] for constraint in check_constraints} == {
            "ck_users_status",
            "ck_users_global_role",
            "ck_users_deactivated_at_required",
        }
        assert {column["name"] for column in columns} == {
            "id",
            "auth0_sub",
            "email",
            "display_name",
            "avatar_url",
            "locale",
            "timezone",
            "status",
            "global_role",
            "created_at",
            "updated_at",
            "deactivated_at",
        }

    run_database_scenario(test_database_url, scenario)


def test_user_provisioning_persists_defaults_and_exact_identity(
    test_database_url: str,
) -> None:
    async def scenario(engine: AsyncEngine) -> None:
        session_factory = build_session_factory(engine)

        async with session_factory() as session:
            first_user = await get_or_create_user_by_auth0_sub(
                session,
                "auth0|DatabaseUser",
                "first@example.com",
            )

        async with session_factory() as session:
            same_user = await get_or_create_user_by_auth0_sub(
                session,
                "auth0|DatabaseUser",
                "updated@example.com",
            )
            case_variant = await get_or_create_user_by_auth0_sub(
                session,
                "auth0|databaseuser",
            )
            stored_users = await session.scalar(select(func.count()).select_from(User))

        assert isinstance(first_user.id, UUID)
        assert first_user.status == UserStatus.ACTIVE
        assert first_user.global_role == GlobalRole.USER
        assert first_user.locale == "fr"
        assert first_user.timezone == "Europe/Paris"
        assert first_user.display_name is None
        assert first_user.avatar_url is None
        assert first_user.deactivated_at is None
        assert same_user.email == "updated@example.com"
        assert first_user.created_at.tzinfo is not None
        assert first_user.updated_at.tzinfo is not None
        assert same_user.id == first_user.id
        assert case_variant.id != first_user.id
        assert stored_users == 2

    run_database_scenario(test_database_url, scenario)


def test_concurrent_first_logins_create_one_user(
    test_database_url: str,
) -> None:
    async def scenario(engine: AsyncEngine) -> None:
        session_factory = build_session_factory(engine)

        async def provision_user() -> User:
            async with session_factory() as session:
                return await get_or_create_user_by_auth0_sub(
                    session,
                    "auth0|ConcurrentUser",
                )

        users = await asyncio.gather(*(provision_user() for _ in range(4)))

        async with session_factory() as session:
            stored_users = await session.scalar(
                select(func.count())
                .select_from(User)
                .where(User.auth0_sub == "auth0|ConcurrentUser")
            )

        assert len({user.id for user in users}) == 1
        assert stored_users == 1

    run_database_scenario(test_database_url, scenario)


@pytest.mark.parametrize(
    ("column_name", "invalid_value"),
    [("status", "unknown"), ("global_role", "admin")],
)
def test_postgresql_rejects_unknown_status_and_role(
    test_database_url: str,
    column_name: str,
    invalid_value: str,
) -> None:
    async def scenario(engine: AsyncEngine) -> None:
        session_factory = build_session_factory(engine)

        async with session_factory() as session:
            with pytest.raises(IntegrityError):
                await session.execute(
                    text(
                        f"INSERT INTO users (auth0_sub, {column_name}) "
                        f"VALUES ('auth0|InvalidValue', :invalid_value)"
                    ),
                    {"invalid_value": invalid_value},
                )
                await session.commit()
            await session.rollback()

            stored_users = await session.scalar(select(func.count()).select_from(User))

        assert stored_users == 0

    run_database_scenario(test_database_url, scenario)


def test_postgresql_requires_timestamp_for_deactivated_status(
    test_database_url: str,
) -> None:
    async def scenario(engine: AsyncEngine) -> None:
        session_factory = build_session_factory(engine)

        async with session_factory() as session:
            with pytest.raises(IntegrityError):
                await session.execute(
                    text(
                        "INSERT INTO users (auth0_sub, status) "
                        "VALUES ('auth0|MissingDeactivationDate', 'deactivated')"
                    )
                )
                await session.commit()
            await session.rollback()

    run_database_scenario(test_database_url, scenario)


def test_profile_deactivation_and_admin_mutations_are_persisted(
    test_database_url: str,
) -> None:
    async def scenario(engine: AsyncEngine) -> None:
        session_factory = build_session_factory(engine)

        async with session_factory() as session:
            admin = await get_or_create_user_by_auth0_sub(session, "auth0|Admin")
            target = await get_or_create_user_by_auth0_sub(session, "auth0|Target")
            admin.global_role = GlobalRole.PLATFORM_ADMIN
            await session.commit()
            await session.refresh(admin)

            target = await update_user_profile(
                session,
                target,
                {
                    "display_name": "Profil cible",
                    "locale": "fr-FR",
                    "timezone": "Africa/Ndjamena",
                },
            )
            target = await update_user_global_role(
                session,
                actor=admin,
                target=target,
                new_role=GlobalRole.SUPPORT,
            )
            target = await update_user_status(
                session,
                actor=admin,
                target=target,
                new_status=UserStatus.SUSPENDED,
            )
            target = await update_user_status(
                session,
                actor=admin,
                target=target,
                new_status=UserStatus.ACTIVE,
            )
            target = await deactivate_user(session, target)
            target_id = target.id

        async with session_factory() as session:
            persisted = await session.get(User, target_id)

        assert persisted is not None
        assert persisted.display_name == "Profil cible"
        assert persisted.locale == "fr-FR"
        assert persisted.timezone == "Africa/Ndjamena"
        assert persisted.global_role == GlobalRole.SUPPORT
        assert persisted.status == UserStatus.DEACTIVATED
        assert persisted.deactivated_at is not None
        assert persisted.deactivated_at.tzinfo is not None

    run_database_scenario(test_database_url, scenario)
