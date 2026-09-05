from datetime import UTC, datetime
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.modules.users.enums import GlobalRole, UserStatus
from app.modules.users.schemas import (
    AdminUserResponse,
    CurrentUserResponse,
    UserListResponse,
    UserProfileUpdate,
    UserRoleUpdate,
    UserStatusUpdate,
)

USER_ID = UUID("1099474f-c9c4-41c7-9b4b-7f324852283d")
NOW = datetime(2026, 9, 1, 10, 30, tzinfo=UTC)


def build_user_response_data() -> dict[str, object]:
    return {
        "id": USER_ID,
        "email": "user@example.com",
        "display_name": "Nezir",
        "avatar_url": "https://cdn.example.com/avatar.png",
        "locale": "fr-FR",
        "timezone": "Europe/Paris",
        "status": UserStatus.ACTIVE,
        "global_role": GlobalRole.USER,
        "created_at": NOW,
        "updated_at": NOW,
        "deactivated_at": None,
    }


def test_profile_update_normalizes_editable_fields() -> None:
    payload = UserProfileUpdate(
        display_name="  Nezir  ",
        avatar_url=" https://cdn.example.com/avatar.png ",
        locale="fr-FR",
        timezone="Africa/Ndjamena",
    )

    assert payload.display_name == "Nezir"
    assert payload.avatar_url == "https://cdn.example.com/avatar.png"
    assert payload.locale == "fr-FR"
    assert payload.timezone == "Africa/Ndjamena"
    assert payload.model_dump(exclude_unset=True) == {
        "display_name": "Nezir",
        "avatar_url": "https://cdn.example.com/avatar.png",
        "locale": "fr-FR",
        "timezone": "Africa/Ndjamena",
    }


def test_profile_update_can_clear_optional_profile_fields() -> None:
    payload = UserProfileUpdate(display_name=None, avatar_url=None)

    assert payload.model_fields_set == {"display_name", "avatar_url"}
    assert payload.model_dump(exclude_unset=True) == {
        "display_name": None,
        "avatar_url": None,
    }


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"display_name": "   "},
        {"avatar_url": "ftp://example.com/avatar.png"},
        {"avatar_url": ""},
        {"locale": None},
        {"locale": "not_a_locale"},
        {"timezone": None},
        {"timezone": "Mars/Olympus"},
        {"email": "attacker@example.com"},
        {"auth0_sub": "auth0|attacker"},
        {"status": "suspended"},
        {"global_role": "platform_admin"},
    ],
)
def test_profile_update_rejects_empty_invalid_or_protected_fields(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        UserProfileUpdate.model_validate(payload)


def test_admin_mutation_payloads_are_closed_enums() -> None:
    assert UserStatusUpdate(status="suspended").status == UserStatus.SUSPENDED
    assert (
        UserRoleUpdate(global_role="platform_admin").global_role
        == GlobalRole.PLATFORM_ADMIN
    )

    with pytest.raises(ValidationError):
        UserStatusUpdate(status="closed")
    with pytest.raises(ValidationError):
        UserRoleUpdate(global_role="admin")
    with pytest.raises(ValidationError):
        UserRoleUpdate.model_validate({"global_role": "support", "status": "active"})


def test_current_and_admin_responses_keep_auth0_compatibility() -> None:
    common = build_user_response_data()
    current = CurrentUserResponse(
        **common,
        authenticated=True,
        sub="auth0|user",
        permissions=["read:tontines"],
        message="Access Token Auth0 valide",
    )
    admin = AdminUserResponse(**common, auth0_sub="auth0|user")
    page = UserListResponse(items=[admin], total=1, limit=50, offset=0)

    assert current.sub == "auth0|user"
    assert current.authenticated is True
    assert admin.auth0_sub == "auth0|user"
    assert page.items == [admin]

    with pytest.raises(ValidationError):
        CurrentUserResponse(
            **common,
            authenticated=False,
            sub="auth0|user",
            message="invalid",
        )
    with pytest.raises(ValidationError):
        UserListResponse(items=[], total=0, limit=101, offset=0)
