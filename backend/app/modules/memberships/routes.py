from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.memberships import services
from app.modules.memberships.dependencies import (
    CurrentMembership,
    InvitationManagerMembership,
    OwnerMembership,
)
from app.modules.memberships.schemas import (
    InvitationAccept,
    InvitationCreate,
    InvitationCreated,
    InvitationList,
    InvitationRead,
    MembershipList,
    MembershipRead,
    MembershipRoleUpdate,
    OwnershipTransfer,
)
from app.modules.tontines.models import Tontine
from app.modules.users.dependencies import get_current_active_user
from app.modules.users.models import User


async def domain_errors() -> AsyncIterator[None]:
    try:
        yield
    except services.MembershipError as error:
        raise HTTPException(error.status_code, error.detail) from error


router = APIRouter(
    tags=["memberships"],
    dependencies=[Depends(domain_errors)],
    responses={
        401: {"description": "Token absent ou invalide"},
        403: {"description": "Compte ou rôle interne non autorisé"},
        404: {"description": "Ressource introuvable ou inaccessible"},
        409: {"description": "Transition métier impossible"},
    },
)
Session = Annotated[AsyncSession, Depends(get_db_session)]
Actor = Annotated[User, Depends(get_current_active_user)]


async def tontine_or_404(session: AsyncSession, tontine_id: UUID) -> Tontine:
    tontine = await session.get(Tontine, tontine_id)
    if tontine is None:
        raise services.MembershipError("Tontine introuvable", 404)
    return tontine


@router.post(
    "/tontines/{tontine_id}/invitations",
    response_model=InvitationCreated,
    status_code=201,
    summary="Inviter une personne",
)
async def create_invitation(
    tontine_id: UUID,
    payload: InvitationCreate,
    session: Session,
    actor: Actor,
    membership: InvitationManagerMembership,
) -> InvitationCreated:
    invitation, token = await services.create_invitation(
        session,
        actor,
        membership,
        await tontine_or_404(session, tontine_id),
        payload,
    )
    return InvitationCreated(
        **InvitationRead.model_validate(invitation).model_dump(), token=token
    )


@router.get(
    "/tontines/{tontine_id}/invitations",
    response_model=InvitationList,
    summary="Lister les invitations",
)
async def list_invitations(
    tontine_id: UUID,
    session: Session,
    membership: InvitationManagerMembership,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> InvitationList:
    del membership
    items, total = await services.list_invitations(
        session, tontine_id, limit=limit, offset=offset
    )
    return InvitationList(
        items=[InvitationRead.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/tontines/{tontine_id}/invitations/{invitation_id}/revoke",
    response_model=InvitationRead,
    summary="Révoquer une invitation",
)
async def revoke_invitation(
    tontine_id: UUID,
    invitation_id: UUID,
    session: Session,
    membership: InvitationManagerMembership,
) -> InvitationRead:
    invitation = await services.revoke_invitation(
        session,
        membership,
        await tontine_or_404(session, tontine_id),
        invitation_id,
    )
    return InvitationRead.model_validate(invitation)


@router.post(
    "/invitations/accept",
    response_model=MembershipRead,
    summary="Accepter une invitation",
)
async def accept_invitation(
    payload: InvitationAccept, session: Session, actor: Actor
) -> MembershipRead:
    return MembershipRead.model_validate(
        await services.accept_invitation(session, actor, payload.token)
    )


@router.get(
    "/tontines/{tontine_id}/members",
    response_model=MembershipList,
    summary="Lister les membres",
)
async def list_members(
    tontine_id: UUID,
    session: Session,
    membership: CurrentMembership,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> MembershipList:
    del membership
    items, total = await services.list_members(
        session, tontine_id, limit=limit, offset=offset
    )
    return MembershipList(
        items=[MembershipRead.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.patch(
    "/tontines/{tontine_id}/members/{user_id}/role",
    response_model=MembershipRead,
    summary="Modifier le rôle d'un membre",
)
async def change_role(
    tontine_id: UUID,
    user_id: UUID,
    payload: MembershipRoleUpdate,
    session: Session,
    owner: OwnerMembership,
) -> MembershipRead:
    del owner
    membership = await services.change_member_role(
        session, await tontine_or_404(session, tontine_id), user_id, payload
    )
    return MembershipRead.model_validate(membership)


@router.post(
    "/tontines/{tontine_id}/ownership-transfer",
    response_model=MembershipRead,
    summary="Transférer la propriété",
)
async def transfer_ownership(
    tontine_id: UUID,
    payload: OwnershipTransfer,
    session: Session,
    owner: OwnerMembership,
) -> MembershipRead:
    target = await services.transfer_ownership(
        session,
        await tontine_or_404(session, tontine_id),
        owner,
        payload.new_owner_user_id,
    )
    return MembershipRead.model_validate(target)


@router.post(
    "/tontines/{tontine_id}/members/me/leave",
    response_model=MembershipRead,
    summary="Quitter une tontine",
)
async def leave(
    tontine_id: UUID, session: Session, membership: CurrentMembership
) -> MembershipRead:
    result = await services.leave_tontine(
        session, await tontine_or_404(session, tontine_id), membership
    )
    return MembershipRead.model_validate(result)


@router.post(
    "/tontines/{tontine_id}/members/{user_id}/remove",
    response_model=MembershipRead,
    summary="Retirer un membre",
)
async def remove(
    tontine_id: UUID,
    user_id: UUID,
    session: Session,
    membership: InvitationManagerMembership,
) -> MembershipRead:
    result = await services.remove_member(
        session,
        await tontine_or_404(session, tontine_id),
        membership,
        user_id,
    )
    return MembershipRead.model_validate(result)
