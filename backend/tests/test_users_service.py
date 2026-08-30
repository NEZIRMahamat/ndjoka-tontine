import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users import dependencies as user_dependencies
from app.modules.users import services as user_services
from app.modules.users.models import USER_STATUS_SUSPENDED, User
from app.modules.users.services import UserProvisioningError
from app.schemas.auth import TokenPayload

AUTH0_SUB = "auth0|ExactCase"


def build_token_payload(sub: str = AUTH0_SUB) -> TokenPayload:
    return TokenPayload(
        sub=sub,
        iss="https://tenant.example.auth0.com/",
        aud="https://api.example.com",
        exp=4_102_444_800,
        iat=1_700_000_000,
    )


def test_get_or_create_returns_existing_user_without_writing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = MagicMock(spec=AsyncSession)
    existing_user = User(
        auth0_sub=AUTH0_SUB,
        email="existing@example.com",
        status=USER_STATUS_SUSPENDED,
    )
    find_user = AsyncMock(return_value=existing_user)
    insert_user = AsyncMock()
    monkeypatch.setattr(user_services, "find_user_by_auth0_sub", find_user)
    monkeypatch.setattr(user_services, "insert_user_if_missing", insert_user)

    user = asyncio.run(
        user_services.get_or_create_user_by_auth0_sub(session, AUTH0_SUB)
    )

    assert user is existing_user
    assert user.email == "existing@example.com"
    assert user.status == USER_STATUS_SUSPENDED
    find_user.assert_awaited_once_with(session, AUTH0_SUB)
    insert_user.assert_not_awaited()
    session.commit.assert_not_awaited()
    session.rollback.assert_not_awaited()


def test_get_or_create_inserts_and_commits_new_user(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = MagicMock(spec=AsyncSession)
    created_user = User(auth0_sub=AUTH0_SUB)
    find_user = AsyncMock(return_value=None)
    insert_user = AsyncMock(return_value=created_user)
    monkeypatch.setattr(user_services, "find_user_by_auth0_sub", find_user)
    monkeypatch.setattr(user_services, "insert_user_if_missing", insert_user)

    user = asyncio.run(
        user_services.get_or_create_user_by_auth0_sub(session, AUTH0_SUB)
    )

    assert user is created_user
    find_user.assert_awaited_once_with(session, AUTH0_SUB)
    insert_user.assert_awaited_once_with(session, AUTH0_SUB)
    session.commit.assert_awaited_once_with()
    session.rollback.assert_not_awaited()


def test_get_or_create_reads_concurrent_winner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = MagicMock(spec=AsyncSession)
    winning_user = User(auth0_sub=AUTH0_SUB)
    find_user = AsyncMock(side_effect=[None, winning_user])
    insert_user = AsyncMock(return_value=None)
    monkeypatch.setattr(user_services, "find_user_by_auth0_sub", find_user)
    monkeypatch.setattr(user_services, "insert_user_if_missing", insert_user)

    user = asyncio.run(
        user_services.get_or_create_user_by_auth0_sub(session, AUTH0_SUB)
    )

    assert user is winning_user
    assert find_user.await_count == 2
    insert_user.assert_awaited_once_with(session, AUTH0_SUB)
    session.commit.assert_awaited_once_with()
    session.rollback.assert_not_awaited()


def test_get_or_create_rolls_back_when_concurrent_user_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = MagicMock(spec=AsyncSession)
    find_user = AsyncMock(side_effect=[None, None])
    insert_user = AsyncMock(return_value=None)
    monkeypatch.setattr(user_services, "find_user_by_auth0_sub", find_user)
    monkeypatch.setattr(user_services, "insert_user_if_missing", insert_user)

    with pytest.raises(UserProvisioningError, match="introuvable"):
        asyncio.run(user_services.get_or_create_user_by_auth0_sub(session, AUTH0_SUB))

    session.commit.assert_not_awaited()
    session.rollback.assert_awaited_once_with()


def test_get_or_create_rolls_back_and_propagates_database_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = MagicMock(spec=AsyncSession)
    database_error = RuntimeError("database unavailable")
    monkeypatch.setattr(
        user_services,
        "find_user_by_auth0_sub",
        AsyncMock(side_effect=database_error),
    )

    with pytest.raises(RuntimeError, match="database unavailable"):
        asyncio.run(user_services.get_or_create_user_by_auth0_sub(session, AUTH0_SUB))

    session.commit.assert_not_awaited()
    session.rollback.assert_awaited_once_with()


def test_get_or_create_rolls_back_when_commit_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = MagicMock(spec=AsyncSession)
    created_user = User(auth0_sub=AUTH0_SUB)
    monkeypatch.setattr(
        user_services,
        "find_user_by_auth0_sub",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        user_services,
        "insert_user_if_missing",
        AsyncMock(return_value=created_user),
    )
    session.commit.side_effect = RuntimeError("commit failed")

    with pytest.raises(RuntimeError, match="commit failed"):
        asyncio.run(user_services.get_or_create_user_by_auth0_sub(session, AUTH0_SUB))

    session.commit.assert_awaited_once_with()
    session.rollback.assert_awaited_once_with()


@pytest.mark.parametrize("auth0_sub", ["", "x" * 256])
def test_get_or_create_rejects_invalid_auth0_sub(auth0_sub: str) -> None:
    session = MagicMock(spec=AsyncSession)

    with pytest.raises(ValueError, match="auth0_sub"):
        asyncio.run(user_services.get_or_create_user_by_auth0_sub(session, auth0_sub))

    session.scalar.assert_not_awaited()
    session.commit.assert_not_awaited()
    session.rollback.assert_not_awaited()


def test_current_user_dependency_forwards_verified_sub(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = MagicMock(spec=AsyncSession)
    token_payload = build_token_payload()
    expected_user = User(auth0_sub=AUTH0_SUB)
    get_or_create_user = AsyncMock(return_value=expected_user)
    monkeypatch.setattr(
        user_dependencies,
        "get_or_create_user_by_auth0_sub",
        get_or_create_user,
    )

    user = asyncio.run(
        user_dependencies.get_current_ndjoka_user(token_payload, session)
    )

    assert user is expected_user
    get_or_create_user.assert_awaited_once_with(session, AUTH0_SUB)


@pytest.mark.parametrize("sub", ["", "x" * 256])
def test_token_payload_rejects_unstorable_sub(sub: str) -> None:
    with pytest.raises(ValidationError, match="sub"):
        build_token_payload(sub)
