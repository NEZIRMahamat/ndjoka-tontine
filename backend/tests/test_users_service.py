import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users import dependencies as user_dependencies
from app.modules.users import services as user_services
from app.modules.users.enums import GlobalRole, UserStatus
from app.modules.users.models import User
from app.modules.users.services import (
    SelfAdministrationForbiddenError,
    UserAdministrationForbiddenError,
    UserNotFoundError,
    UserProvisioningError,
)
from app.schemas.auth import TokenPayload

AUTH0_SUB = "auth0|ExactCase"
USER_ID = UUID("7596475b-e526-4bd2-a5d8-6a9c22039d1b")
OTHER_USER_ID = UUID("3f0e54fd-aeba-4c8f-94eb-e2e5de40fdc7")
NOW = datetime(2026, 9, 1, 8, 0, tzinfo=UTC)


def build_user(
    *,
    user_id: UUID = USER_ID,
    status: UserStatus = UserStatus.ACTIVE,
    global_role: GlobalRole = GlobalRole.USER,
    email: str | None = None,
) -> User:
    return User(
        id=user_id,
        auth0_sub=AUTH0_SUB,
        email=email,
        display_name=None,
        avatar_url=None,
        locale="fr",
        timezone="Europe/Paris",
        status=status,
        global_role=global_role,
        created_at=NOW,
        updated_at=NOW,
        deactivated_at=None,
    )


def build_token_payload(
    *,
    sub: str = AUTH0_SUB,
    email: str | None = None,
) -> TokenPayload:
    return TokenPayload(
        sub=sub,
        iss="https://tenant.example.auth0.com/",
        aud="https://api.example.com",
        exp=4_102_444_800,
        iat=1_700_000_000,
        email=email,
    )


def test_get_or_create_returns_existing_user_without_writing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = MagicMock(spec=AsyncSession)
    existing_user = build_user(email="existing@example.com")
    find_user = AsyncMock(return_value=existing_user)
    insert_user = AsyncMock()
    monkeypatch.setattr(user_services, "find_user_by_auth0_sub", find_user)
    monkeypatch.setattr(user_services, "insert_user_if_missing", insert_user)

    user = asyncio.run(
        user_services.get_or_create_user_by_auth0_sub(session, AUTH0_SUB)
    )

    assert user is existing_user
    find_user.assert_awaited_once_with(session, AUTH0_SUB)
    insert_user.assert_not_awaited()
    session.commit.assert_not_awaited()
    session.rollback.assert_not_awaited()


def test_get_or_create_synchronizes_signed_auth0_email(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = MagicMock(spec=AsyncSession)
    existing_user = build_user(email="old@example.com")
    monkeypatch.setattr(
        user_services,
        "find_user_by_auth0_sub",
        AsyncMock(return_value=existing_user),
    )

    user = asyncio.run(
        user_services.get_or_create_user_by_auth0_sub(
            session,
            AUTH0_SUB,
            "new@example.com",
        )
    )

    assert user.email == "new@example.com"
    session.commit.assert_awaited_once_with()
    session.refresh.assert_awaited_once_with(existing_user)
    session.rollback.assert_not_awaited()


def test_get_or_create_inserts_and_commits_new_user(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = MagicMock(spec=AsyncSession)
    created_user = build_user(email="new@example.com")
    find_user = AsyncMock(return_value=None)
    insert_user = AsyncMock(return_value=created_user)
    monkeypatch.setattr(user_services, "find_user_by_auth0_sub", find_user)
    monkeypatch.setattr(user_services, "insert_user_if_missing", insert_user)

    user = asyncio.run(
        user_services.get_or_create_user_by_auth0_sub(
            session,
            AUTH0_SUB,
            "new@example.com",
        )
    )

    assert user is created_user
    insert_user.assert_awaited_once_with(
        session,
        AUTH0_SUB,
        "new@example.com",
    )
    session.commit.assert_awaited_once_with()
    session.rollback.assert_not_awaited()


def test_get_or_create_reads_concurrent_winner_and_syncs_email(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = MagicMock(spec=AsyncSession)
    winning_user = build_user(email=None)
    find_user = AsyncMock(side_effect=[None, winning_user])
    monkeypatch.setattr(user_services, "find_user_by_auth0_sub", find_user)
    monkeypatch.setattr(
        user_services,
        "insert_user_if_missing",
        AsyncMock(return_value=None),
    )

    user = asyncio.run(
        user_services.get_or_create_user_by_auth0_sub(
            session,
            AUTH0_SUB,
            "winner@example.com",
        )
    )

    assert user is winning_user
    assert user.email == "winner@example.com"
    assert find_user.await_count == 2
    session.commit.assert_awaited_once_with()


def test_get_or_create_rolls_back_when_concurrent_user_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = MagicMock(spec=AsyncSession)
    monkeypatch.setattr(
        user_services,
        "find_user_by_auth0_sub",
        AsyncMock(side_effect=[None, None]),
    )
    monkeypatch.setattr(
        user_services,
        "insert_user_if_missing",
        AsyncMock(return_value=None),
    )

    with pytest.raises(UserProvisioningError, match="introuvable"):
        asyncio.run(user_services.get_or_create_user_by_auth0_sub(session, AUTH0_SUB))

    session.rollback.assert_awaited_once_with()


def test_get_or_create_rolls_back_when_database_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = MagicMock(spec=AsyncSession)
    monkeypatch.setattr(
        user_services,
        "find_user_by_auth0_sub",
        AsyncMock(side_effect=RuntimeError("database unavailable")),
    )

    with pytest.raises(RuntimeError, match="database unavailable"):
        asyncio.run(user_services.get_or_create_user_by_auth0_sub(session, AUTH0_SUB))

    session.rollback.assert_awaited_once_with()


@pytest.mark.parametrize(
    ("auth0_sub", "email"),
    [
        ("", None),
        ("x" * 256, None),
        (AUTH0_SUB, ""),
        (AUTH0_SUB, "x" * 256),
    ],
)
def test_get_or_create_rejects_unstorable_identity(
    auth0_sub: str,
    email: str | None,
) -> None:
    session = MagicMock(spec=AsyncSession)

    with pytest.raises(ValueError):
        asyncio.run(
            user_services.get_or_create_user_by_auth0_sub(
                session,
                auth0_sub,
                email,
            )
        )

    session.scalar.assert_not_awaited()
    session.commit.assert_not_awaited()


def test_update_profile_only_changes_whitelisted_fields() -> None:
    session = MagicMock(spec=AsyncSession)
    user = build_user()

    updated_user = asyncio.run(
        user_services.update_user_profile(
            session,
            user,
            {
                "display_name": "Nezir",
                "avatar_url": None,
                "locale": "fr-FR",
                "timezone": "Africa/Ndjamena",
            },
        )
    )

    assert updated_user is user
    assert user.display_name == "Nezir"
    assert user.locale == "fr-FR"
    assert user.timezone == "Africa/Ndjamena"
    session.commit.assert_awaited_once_with()
    session.refresh.assert_awaited_once_with(user)


@pytest.mark.parametrize("changes", [{}, {"status": UserStatus.SUSPENDED}])
def test_update_profile_rejects_empty_or_protected_changes(
    changes: dict[str, object],
) -> None:
    session = MagicMock(spec=AsyncSession)

    with pytest.raises(ValueError):
        asyncio.run(user_services.update_user_profile(session, build_user(), changes))

    session.commit.assert_not_awaited()


def test_deactivate_user_sets_status_and_utc_timestamp() -> None:
    session = MagicMock(spec=AsyncSession)
    user = build_user()

    deactivated = asyncio.run(user_services.deactivate_user(session, user))

    assert deactivated.status == UserStatus.DEACTIVATED
    assert deactivated.deactivated_at is not None
    assert deactivated.deactivated_at.tzinfo is UTC
    session.commit.assert_awaited_once_with()
    session.refresh.assert_awaited_once_with(user)


def test_get_user_by_id_raises_domain_error_when_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = MagicMock(spec=AsyncSession)
    monkeypatch.setattr(
        user_services,
        "find_user_by_id",
        AsyncMock(return_value=None),
    )

    with pytest.raises(UserNotFoundError, match="introuvable"):
        asyncio.run(user_services.get_user_by_id(session, USER_ID))


def test_get_users_page_combines_repository_results(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = MagicMock(spec=AsyncSession)
    users = [build_user()]
    list_mock = AsyncMock(return_value=users)
    count_mock = AsyncMock(return_value=4)
    monkeypatch.setattr(user_services, "list_users", list_mock)
    monkeypatch.setattr(user_services, "count_users", count_mock)

    page = asyncio.run(
        user_services.get_users_page(
            session,
            limit=20,
            offset=20,
            status=UserStatus.ACTIVE,
            global_role=GlobalRole.USER,
        )
    )

    assert page == (users, 4)
    list_mock.assert_awaited_once_with(
        session,
        limit=20,
        offset=20,
        status=UserStatus.ACTIVE,
        global_role=GlobalRole.USER,
    )


def test_platform_admin_can_change_another_users_status() -> None:
    session = MagicMock(spec=AsyncSession)
    actor = build_user(global_role=GlobalRole.PLATFORM_ADMIN)
    target = build_user(user_id=OTHER_USER_ID)

    updated = asyncio.run(
        user_services.update_user_status(
            session,
            actor=actor,
            target=target,
            new_status=UserStatus.DEACTIVATED,
        )
    )

    assert updated.status == UserStatus.DEACTIVATED
    assert updated.deactivated_at is not None
    session.commit.assert_awaited_once_with()
    session.refresh.assert_awaited_once_with(target)


def test_status_change_is_idempotent_without_database_write() -> None:
    session = MagicMock(spec=AsyncSession)
    actor = build_user(global_role=GlobalRole.PLATFORM_ADMIN)
    target = build_user(user_id=OTHER_USER_ID, status=UserStatus.SUSPENDED)

    updated = asyncio.run(
        user_services.update_user_status(
            session,
            actor=actor,
            target=target,
            new_status=UserStatus.SUSPENDED,
        )
    )

    assert updated is target
    session.commit.assert_not_awaited()


def test_platform_admin_can_change_another_users_global_role() -> None:
    session = MagicMock(spec=AsyncSession)
    actor = build_user(global_role=GlobalRole.PLATFORM_ADMIN)
    target = build_user(user_id=OTHER_USER_ID)

    updated = asyncio.run(
        user_services.update_user_global_role(
            session,
            actor=actor,
            target=target,
            new_role=GlobalRole.SUPPORT,
        )
    )

    assert updated.global_role == GlobalRole.SUPPORT
    session.commit.assert_awaited_once_with()


@pytest.mark.parametrize("operation", ["status", "role"])
def test_service_rejects_non_admin_mutations(operation: str) -> None:
    session = MagicMock(spec=AsyncSession)
    actor = build_user(global_role=GlobalRole.SUPPORT)
    target = build_user(user_id=OTHER_USER_ID)

    with pytest.raises(UserAdministrationForbiddenError):
        if operation == "status":
            asyncio.run(
                user_services.update_user_status(
                    session,
                    actor=actor,
                    target=target,
                    new_status=UserStatus.SUSPENDED,
                )
            )
        else:
            asyncio.run(
                user_services.update_user_global_role(
                    session,
                    actor=actor,
                    target=target,
                    new_role=GlobalRole.USER,
                )
            )

    session.commit.assert_not_awaited()


@pytest.mark.parametrize("operation", ["status", "role"])
def test_platform_admin_cannot_modify_own_status_or_role(operation: str) -> None:
    session = MagicMock(spec=AsyncSession)
    actor = build_user(global_role=GlobalRole.PLATFORM_ADMIN)

    with pytest.raises(SelfAdministrationForbiddenError):
        if operation == "status":
            asyncio.run(
                user_services.update_user_status(
                    session,
                    actor=actor,
                    target=actor,
                    new_status=UserStatus.SUSPENDED,
                )
            )
        else:
            asyncio.run(
                user_services.update_user_global_role(
                    session,
                    actor=actor,
                    target=actor,
                    new_role=GlobalRole.USER,
                )
            )

    session.commit.assert_not_awaited()


def test_current_user_dependency_forwards_verified_identity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = MagicMock(spec=AsyncSession)
    token_payload = build_token_payload(email="auth0@example.com")
    expected_user = build_user(email="auth0@example.com")
    get_or_create = AsyncMock(return_value=expected_user)
    monkeypatch.setattr(
        user_dependencies,
        "get_or_create_user_by_auth0_sub",
        get_or_create,
    )

    user = asyncio.run(
        user_dependencies.get_current_ndjoka_user(token_payload, session)
    )

    assert user is expected_user
    get_or_create.assert_awaited_once_with(
        session,
        AUTH0_SUB,
        "auth0@example.com",
    )


@pytest.mark.parametrize(
    ("user_status", "expected_detail"),
    [
        (UserStatus.SUSPENDED, "suspendu"),
        (UserStatus.DEACTIVATED, "désactivé"),
    ],
)
def test_active_user_dependency_blocks_non_active_accounts(
    user_status: UserStatus,
    expected_detail: str,
) -> None:
    with pytest.raises(HTTPException) as caught:
        asyncio.run(
            user_dependencies.get_current_active_user(build_user(status=user_status))
        )

    assert caught.value.status_code == 403
    assert expected_detail in caught.value.detail


@pytest.mark.parametrize(
    "global_role",
    [GlobalRole.SUPPORT, GlobalRole.PLATFORM_ADMIN],
)
def test_support_dependency_allows_read_roles(global_role: GlobalRole) -> None:
    user = build_user(global_role=global_role)

    assert (
        asyncio.run(user_dependencies.get_current_support_or_admin_user(user)) is user
    )


def test_support_dependency_blocks_regular_user() -> None:
    with pytest.raises(HTTPException) as caught:
        asyncio.run(user_dependencies.get_current_support_or_admin_user(build_user()))
    assert caught.value.status_code == 403


def test_platform_admin_dependency_rejects_support() -> None:
    with pytest.raises(HTTPException) as caught:
        asyncio.run(
            user_dependencies.get_current_platform_admin(
                build_user(global_role=GlobalRole.SUPPORT)
            )
        )
    assert caught.value.status_code == 403


@pytest.mark.parametrize("sub", ["", "x" * 256])
def test_token_payload_rejects_unstorable_sub(sub: str) -> None:
    with pytest.raises(ValidationError):
        build_token_payload(sub=sub)
