from collections.abc import Callable, Coroutine
from typing import Annotated, Any
from uuid import UUID

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.memberships import repositories
from app.modules.memberships.enums import MembershipRole
from app.modules.memberships.models import Membership
from app.modules.users.dependencies import get_current_active_user
from app.modules.users.models import User

Session = Annotated[AsyncSession, Depends(get_db_session)]
Actor = Annotated[User, Depends(get_current_active_user)]


async def get_current_membership(
    tontine_id: UUID, session: Session, actor: Actor
) -> Membership:
    membership = await repositories.find_membership(
        session, tontine_id, actor.id, active_only=True
    )
    if membership is None:
        raise HTTPException(404, "Tontine introuvable")
    return membership


def require_tontine_roles(
    *roles: MembershipRole,
) -> Callable[..., Coroutine[Any, Any, Membership]]:
    async def dependency(
        membership: Annotated[Membership, Depends(get_current_membership)],
    ) -> Membership:
        if membership.role not in roles:
            raise HTTPException(403, "Rôle interne insuffisant")
        return membership

    return dependency


CurrentMembership = Annotated[Membership, Depends(get_current_membership)]
OwnerMembership = Annotated[
    Membership, Depends(require_tontine_roles(MembershipRole.OWNER))
]
InvitationManagerMembership = Annotated[
    Membership,
    Depends(require_tontine_roles(MembershipRole.OWNER, MembershipRole.MANAGER)),
]
