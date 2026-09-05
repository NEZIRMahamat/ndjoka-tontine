from sqlalchemy import CheckConstraint, DateTime, Enum, UniqueConstraint, Uuid

from app.db.base import Base
from app.db.models import load_all_models
from app.modules.users.enums import GlobalRole, UserStatus
from app.modules.users.models import User

REQUIRED_USER_COLUMNS = {
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
FORBIDDEN_USER_COLUMNS = {
    "hashed_password",
    "password_hash",
    "totp_secret",
    "refresh_token",
    "access_token",
    "phone",
    "phone_number",
    "kyc_status",
    "bank_account",
}


def test_user_model_is_registered_with_sprint_one_columns() -> None:
    registered_models = load_all_models()
    table = Base.metadata.tables["users"]

    assert User in registered_models
    assert table is User.__table__
    assert set(table.c.keys()) == REQUIRED_USER_COLUMNS
    assert FORBIDDEN_USER_COLUMNS.isdisjoint(table.c.keys())


def test_user_identity_constraints_are_explicit() -> None:
    table = User.__table__
    unique_column_sets = {
        frozenset(constraint.columns.keys())
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
    }

    assert isinstance(table.c.id.type, Uuid)
    assert table.c.id.primary_key is True
    assert table.c.id.nullable is False
    assert table.c.id.server_default is not None
    assert table.c.auth0_sub.nullable is False
    assert table.c.auth0_sub.type.length == 255
    assert frozenset({"auth0_sub"}) in unique_column_sets
    assert table.c.email.nullable is True
    assert frozenset({"email"}) not in unique_column_sets


def test_user_profile_columns_have_expected_nullability_and_lengths() -> None:
    table = User.__table__

    assert table.c.display_name.nullable is True
    assert table.c.display_name.type.length == 120
    assert table.c.avatar_url.nullable is True
    assert table.c.avatar_url.type.length == 2048
    assert table.c.locale.nullable is False
    assert table.c.locale.type.length == 35
    assert str(table.c.locale.server_default.arg) == "'fr'"
    assert table.c.timezone.nullable is False
    assert table.c.timezone.type.length == 64
    assert str(table.c.timezone.server_default.arg) == "'Europe/Paris'"


def test_user_status_and_global_role_use_closed_enums_and_database_defaults() -> None:
    table = User.__table__

    assert isinstance(table.c.status.type, Enum)
    assert table.c.status.type.enums == [member.value for member in UserStatus]
    assert table.c.status.nullable is False
    assert str(table.c.status.server_default.arg) == "'active'"
    assert table.c.status.default.arg == UserStatus.ACTIVE

    assert isinstance(table.c.global_role.type, Enum)
    assert table.c.global_role.type.enums == [member.value for member in GlobalRole]
    assert table.c.global_role.nullable is False
    assert str(table.c.global_role.server_default.arg) == "'user'"
    assert table.c.global_role.default.arg == GlobalRole.USER


def test_user_lifecycle_constraints_are_explicit() -> None:
    constraints = {
        constraint.name: str(constraint.sqltext)
        for constraint in User.__table__.constraints
        if isinstance(constraint, CheckConstraint)
    }

    assert set(constraints) == {
        "ck_users_status",
        "ck_users_global_role",
        "ck_users_deactivated_at_required",
    }
    assert "'active'" in constraints["ck_users_status"]
    assert "'suspended'" in constraints["ck_users_status"]
    assert "'deactivated'" in constraints["ck_users_status"]
    assert "pending" not in constraints["ck_users_status"]
    assert "closed" not in constraints["ck_users_status"]
    assert "'user'" in constraints["ck_users_global_role"]
    assert "'support'" in constraints["ck_users_global_role"]
    assert "'platform_admin'" in constraints["ck_users_global_role"]
    assert (
        "deactivated_at IS NOT NULL" in constraints["ck_users_deactivated_at_required"]
    )


def test_user_timestamps_are_timezone_aware_at_database_level() -> None:
    table = User.__table__

    for column_name in ("created_at", "updated_at", "deactivated_at"):
        column = table.c[column_name]
        assert isinstance(column.type, DateTime)
        assert column.type.timezone is True

    assert table.c.created_at.nullable is False
    assert table.c.created_at.server_default is not None
    assert table.c.updated_at.nullable is False
    assert table.c.updated_at.server_default is not None
    assert table.c.updated_at.onupdate is not None
    assert table.c.deactivated_at.nullable is True
    assert table.c.deactivated_at.server_default is None
