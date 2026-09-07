import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.main import app
from app.modules.memberships import repositories, services
from app.modules.memberships.dependencies import get_current_membership
from app.modules.memberships.enums import (
    InvitationStatus,
    MembershipRole,
    MembershipStatus,
)
from app.modules.memberships.models import Invitation, Membership
from app.modules.memberships.schemas import InvitationCreate, MembershipRoleUpdate
from app.modules.tontines.enums import TontineStatus
from app.modules.tontines.models import Tontine
from app.modules.users.dependencies import get_current_ndjoka_user
from app.modules.users.enums import GlobalRole, UserStatus
from app.modules.users.models import User


def make_actor(email: str = "owner@example.com") -> User:
    return User(
        id=uuid4(),
        auth0_sub=f"auth0|{uuid4()}",
        email=email,
        status=UserStatus.ACTIVE,
        global_role=GlobalRole.USER,
    )


def make_tontine(actor: User) -> Tontine:
    now = datetime.now(UTC)
    return Tontine(
        id=uuid4(),
        name="Famille",
        currency="EUR",
        status=TontineStatus.DRAFT,
        created_by_user_id=actor.id,
        created_at=now,
        updated_at=now,
    )


def make_membership(tontine: Tontine, actor: User, role=MembershipRole.OWNER):
    now = datetime.now(UTC)
    return Membership(
        id=uuid4(),
        tontine_id=tontine.id,
        user_id=actor.id,
        role=role,
        status=MembershipStatus.ACTIVE,
        joined_at=now,
        updated_at=now,
        ended_at=None,
    )


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "invalide"},
        {"email": "a@b.fr", "role": "owner"},
        {"email": "a@b.fr", "role": "admin"},
        {"email": "a@b.fr", "unknown": True},
    ],
)
def test_invitation_schema_rejects_invalid_payload(payload):
    with pytest.raises(ValidationError):
        InvitationCreate.model_validate(payload)


def test_invitation_schema_normalizes_email_and_defaults_role():
    payload = InvitationCreate(email="  Personne@Example.COM ")
    assert payload.email == "personne@example.com"
    assert payload.role == MembershipRole.MEMBER


def test_token_hash_is_deterministic_and_does_not_contain_token():
    token = "a" * 43
    digest = services.hash_invitation_token(token)
    assert len(digest) == 64
    assert token not in digest
    assert digest == services.hash_invitation_token(token)


def test_manager_can_only_invite_standard_member():
    actor = make_actor()
    membership = make_membership(make_tontine(actor), actor, MembershipRole.MANAGER)
    services.ensure_invitation_permission(membership, MembershipRole.MEMBER)
    with pytest.raises(services.MembershipError) as error:
        services.ensure_invitation_permission(membership, MembershipRole.TREASURER)
    assert error.value.status_code == 403


def test_owner_role_requires_transfer_endpoint():
    actor = make_actor()
    membership = make_membership(make_tontine(actor), actor)
    with pytest.raises(services.MembershipError) as error:
        services.ensure_invitation_permission(membership, MembershipRole.OWNER)
    assert error.value.status_code == 400


def test_repository_scopes_invitation_to_tontine_and_locks():
    session = MagicMock(spec=AsyncSession)
    session.scalar.return_value = None
    asyncio.run(repositories.find_invitation(session, uuid4(), uuid4(), lock=True))
    statement = session.scalar.call_args.args[0]
    sql = str(statement.compile(dialect=postgresql.dialect()))
    assert "invitations.tontine_id =" in sql
    assert "invitations.id =" in sql
    assert "FOR UPDATE" in sql


def test_role_update_accepts_internal_roles_only():
    assert MembershipRoleUpdate(role="treasurer").role == MembershipRole.TREASURER
    with pytest.raises(ValidationError):
        MembershipRoleUpdate(role="platform_admin")


def test_openapi_documents_sprint_3_routes():
    actor = make_actor()
    tontine = make_tontine(actor)
    membership = make_membership(tontine, actor)
    session = MagicMock(spec=AsyncSession)
    app.dependency_overrides[get_current_ndjoka_user] = lambda: actor
    app.dependency_overrides[get_db_session] = lambda: session
    app.dependency_overrides[get_current_membership] = lambda: membership
    try:
        with TestClient(app) as client:
            schema = client.get("/openapi.json").json()
    finally:
        app.dependency_overrides.clear()
    assert schema["info"]["version"] == "0.4.0"
    expected = {
        "/api/v1/tontines/{tontine_id}/invitations": {"get", "post"},
        "/api/v1/tontines/{tontine_id}/invitations/{invitation_id}/revoke": {"post"},
        "/api/v1/invitations/accept": {"post"},
        "/api/v1/tontines/{tontine_id}/members": {"get"},
        "/api/v1/tontines/{tontine_id}/members/{user_id}/role": {"patch"},
        "/api/v1/tontines/{tontine_id}/members/{user_id}/remove": {"post"},
        "/api/v1/tontines/{tontine_id}/members/me/leave": {"post"},
        "/api/v1/tontines/{tontine_id}/ownership-transfer": {"post"},
    }
    for path, methods in expected.items():
        assert methods <= schema["paths"][path].keys()
        for method in methods:
            assert schema["paths"][path][method]["security"] == [{"Auth0Bearer": []}]


def test_archived_tontine_rejects_member_mutations():
    actor = make_actor()
    tontine = make_tontine(actor)
    tontine.status = TontineStatus.ARCHIVED
    tontine.archived_at = datetime.now(UTC)
    with pytest.raises(services.MembershipError) as error:
        services.ensure_writable(tontine)
    assert error.value.status_code == 409


def test_permission_dependency_rejects_wrong_role():
    actor = make_actor()
    membership = make_membership(make_tontine(actor), actor, MembershipRole.MEMBER)
    dependency = __import__(
        "app.modules.memberships.dependencies", fromlist=["require_tontine_roles"]
    ).require_tontine_roles(MembershipRole.OWNER)
    with pytest.raises(HTTPException) as error:
        asyncio.run(dependency(membership))
    assert error.value.status_code == 403


def test_invitation_expiry_boundary():
    actor = make_actor()
    tontine = make_tontine(actor)
    invitation = Invitation(
        id=uuid4(),
        tontine_id=tontine.id,
        email="member@example.com",
        role=MembershipRole.MEMBER,
        token_hash="a" * 64,
        status=InvitationStatus.PENDING,
        invited_by_user_id=actor.id,
        created_at=datetime.now(UTC) - timedelta(days=8),
        expires_at=datetime.now(UTC) - timedelta(days=1),
    )
    assert invitation.expires_at <= datetime.now(UTC)
