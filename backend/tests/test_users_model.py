from sqlalchemy import CheckConstraint, DateTime, UniqueConstraint, Uuid

from app.db.base import Base
from app.db.models import load_all_models
from app.modules.users.models import User

REQUIRED_USER_COLUMNS = {
    "id",
    "auth0_sub",
    "email",
    "status",
    "created_at",
    "updated_at",
}
FORBIDDEN_AUTH_COLUMNS = {
    "hashed_password",
    "password_hash",
    "totp_secret",
    "refresh_token",
}


def test_user_model_is_registered_with_minimal_columns() -> None:
    registered_models = load_all_models()
    table = Base.metadata.tables["users"]

    assert User in registered_models
    assert table is User.__table__
    assert REQUIRED_USER_COLUMNS <= set(table.c.keys())
    assert FORBIDDEN_AUTH_COLUMNS.isdisjoint(table.c.keys())


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
    assert frozenset({"auth0_sub"}) in unique_column_sets
    assert table.c.email.nullable is True
    assert frozenset({"email"}) not in unique_column_sets


def test_user_status_and_timestamps_have_database_defaults() -> None:
    table = User.__table__
    status_constraints = [
        constraint
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    ]

    assert table.c.status.nullable is False
    assert table.c.status.server_default is not None
    assert str(table.c.status.server_default.arg) == "'active'"
    assert len(status_constraints) == 1
    assert status_constraints[0].name == "ck_users_status"
    assert "pending" in str(status_constraints[0].sqltext)
    assert "active" in str(status_constraints[0].sqltext)
    assert "suspended" in str(status_constraints[0].sqltext)
    assert "closed" in str(status_constraints[0].sqltext)

    for column_name in ("created_at", "updated_at"):
        column = table.c[column_name]
        assert isinstance(column.type, DateTime)
        assert column.type.timezone is True
        assert column.nullable is False
        assert column.server_default is not None

    assert table.c.updated_at.onupdate is not None
