import asyncio
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users.enums import GlobalRole, UserStatus
from app.modules.users.models import User
from app.modules.users.repositories import (
    count_users,
    find_user_by_auth0_sub,
    find_user_by_id,
    insert_user_if_missing,
    list_users,
)

AUTH0_SUB = "auth0|ExactCase"
USER_ID = UUID("b75bd820-e731-4e53-b184-da6d5b8bd231")


def compile_postgresql(statement: object) -> str:
    return str(
        statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )


def test_find_user_by_auth0_sub_uses_exact_identity() -> None:
    session = MagicMock(spec=AsyncSession)
    expected_user = User(auth0_sub=AUTH0_SUB)
    session.scalar = AsyncMock(return_value=expected_user)

    user = asyncio.run(find_user_by_auth0_sub(session, AUTH0_SUB))

    statement = session.scalar.await_args.args[0]
    assert user is expected_user
    assert "WHERE users.auth0_sub = 'auth0|ExactCase'" in compile_postgresql(statement)


def test_find_user_by_id_uses_internal_uuid() -> None:
    session = MagicMock(spec=AsyncSession)
    expected_user = User(id=USER_ID, auth0_sub=AUTH0_SUB)
    session.scalar = AsyncMock(return_value=expected_user)

    user = asyncio.run(find_user_by_id(session, USER_ID))

    statement = session.scalar.await_args.args[0]
    assert user is expected_user
    assert f"WHERE users.id = '{USER_ID}'" in compile_postgresql(statement)


def test_insert_user_if_missing_uses_email_defaults_and_unique_constraint() -> None:
    session = MagicMock(spec=AsyncSession)
    expected_user = User(auth0_sub=AUTH0_SUB, email="user@example.com")
    session.scalar = AsyncMock(return_value=expected_user)

    user = asyncio.run(insert_user_if_missing(session, AUTH0_SUB, "user@example.com"))

    statement = session.scalar.await_args.args[0]
    compiled_statement = compile_postgresql(statement)

    assert user is expected_user
    assert "INSERT INTO users" in compiled_statement
    assert "'auth0|ExactCase'" in compiled_statement
    assert "'user@example.com'" in compiled_statement
    assert "'active'" in compiled_statement
    assert "'user'" in compiled_statement
    assert "'fr'" in compiled_statement
    assert "'Europe/Paris'" in compiled_statement
    assert (
        "ON CONFLICT ON CONSTRAINT uq_users_auth0_sub DO NOTHING" in compiled_statement
    )
    assert "RETURNING users.id" in compiled_statement


def test_list_users_applies_filters_pagination_and_stable_order() -> None:
    session = MagicMock(spec=AsyncSession)
    expected_users = [User(id=USER_ID, auth0_sub=AUTH0_SUB)]
    scalar_result = MagicMock()
    scalar_result.all.return_value = expected_users
    session.scalars = AsyncMock(return_value=scalar_result)

    users = asyncio.run(
        list_users(
            session,
            limit=25,
            offset=50,
            status=UserStatus.SUSPENDED,
            global_role=GlobalRole.SUPPORT,
        )
    )

    statement = session.scalars.await_args.args[0]
    compiled_statement = compile_postgresql(statement)
    assert users == expected_users
    assert "users.status = 'suspended'" in compiled_statement
    assert "users.global_role = 'support'" in compiled_statement
    assert "ORDER BY users.created_at, users.id" in compiled_statement
    assert "LIMIT 25 OFFSET 50" in compiled_statement


def test_list_users_without_filters_does_not_add_filter_predicates() -> None:
    session = MagicMock(spec=AsyncSession)
    scalar_result = MagicMock()
    scalar_result.all.return_value = []
    session.scalars = AsyncMock(return_value=scalar_result)

    users = asyncio.run(list_users(session, limit=10, offset=0))

    statement = session.scalars.await_args.args[0]
    compiled_statement = compile_postgresql(statement)
    assert users == []
    assert " WHERE " not in compiled_statement
    assert "ORDER BY users.created_at, users.id" in compiled_statement
    assert "LIMIT 10 OFFSET 0" in compiled_statement


def test_count_users_applies_same_filters_and_returns_integer() -> None:
    session = MagicMock(spec=AsyncSession)
    session.scalar = AsyncMock(return_value=7)

    count = asyncio.run(
        count_users(
            session,
            status=UserStatus.ACTIVE,
            global_role=GlobalRole.PLATFORM_ADMIN,
        )
    )

    statement = session.scalar.await_args.args[0]
    compiled_statement = compile_postgresql(statement)
    assert count == 7
    assert "count(*)" in compiled_statement
    assert "FROM users" in compiled_statement
    assert "users.status = 'active'" in compiled_statement
    assert "users.global_role = 'platform_admin'" in compiled_statement


def test_count_users_normalizes_empty_scalar_to_zero() -> None:
    session = MagicMock(spec=AsyncSession)
    session.scalar = AsyncMock(return_value=None)

    count = asyncio.run(count_users(session))

    assert count == 0
