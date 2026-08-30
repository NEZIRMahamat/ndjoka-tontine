import asyncio
from unittest.mock import AsyncMock, MagicMock

from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users.models import User
from app.modules.users.repositories import (
    find_user_by_auth0_sub,
    insert_user_if_missing,
)

AUTH0_SUB = "auth0|ExactCase"


def test_find_user_by_auth0_sub_uses_exact_identity() -> None:
    session = MagicMock(spec=AsyncSession)
    expected_user = User(auth0_sub=AUTH0_SUB)
    session.scalar = AsyncMock(return_value=expected_user)

    user = asyncio.run(find_user_by_auth0_sub(session, AUTH0_SUB))

    statement = session.scalar.await_args.args[0]
    compiled_statement = str(
        statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )

    assert user is expected_user
    assert "WHERE users.auth0_sub = 'auth0|ExactCase'" in compiled_statement


def test_insert_user_if_missing_uses_unique_auth0_constraint() -> None:
    session = MagicMock(spec=AsyncSession)
    expected_user = User(auth0_sub=AUTH0_SUB)
    session.scalar = AsyncMock(return_value=expected_user)

    user = asyncio.run(insert_user_if_missing(session, AUTH0_SUB))

    statement = session.scalar.await_args.args[0]
    compiled_statement = str(
        statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )

    assert user is expected_user
    assert "INSERT INTO users" in compiled_statement
    assert "'auth0|ExactCase'" in compiled_statement
    assert "'active'" in compiled_statement
    assert (
        "ON CONFLICT ON CONSTRAINT uq_users_auth0_sub DO NOTHING" in compiled_statement
    )
    assert "RETURNING users.id" in compiled_statement
