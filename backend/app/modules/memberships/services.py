import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.memberships import repositories
from app.modules.memberships.enums import (
    InvitationStatus,
    MembershipRole,
    MembershipStatus,
)
from app.modules.memberships.models import Invitation, Membership
from app.modules.memberships.schemas import InvitationCreate, MembershipRoleUpdate
from app.modules.tontines.enums import TontineStatus
from app.modules.tontines.models import Tontine
from app.modules.users.models import User

INVITATION_LIFETIME = timedelta(days=7)


class MembershipError(Exception):
    def __init__(self, detail: str, status_code: int) -> None:
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


def hash_invitation_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def ensure_writable(tontine: Tontine) -> None:
    if tontine.status == TontineStatus.ARCHIVED:
        raise MembershipError("Une tontine archivée est en lecture seule", 409)


def ensure_invitation_permission(
    actor_membership: Membership, role: MembershipRole
) -> None:
    if role == MembershipRole.OWNER:
        raise MembershipError("Le rôle owner s'attribue uniquement par transfert", 400)
    if (
        actor_membership.role == MembershipRole.MANAGER
        and role != MembershipRole.MEMBER
    ):
        raise MembershipError(
            "Un manager peut seulement inviter un membre standard", 403
        )
    if actor_membership.role not in {MembershipRole.OWNER, MembershipRole.MANAGER}:
        raise MembershipError("Rôle interne insuffisant", 403)


async def create_invitation(
    session: AsyncSession,
    actor: User,
    actor_membership: Membership,
    tontine: Tontine,
    payload: InvitationCreate,
) -> tuple[Invitation, str]:
    ensure_writable(tontine)
    ensure_invitation_permission(actor_membership, payload.role)
    email = str(payload.email)
    if actor.email and actor.email.casefold() == email.casefold():
        raise MembershipError("Vous êtes déjà membre de cette tontine", 409)
    existing_user = await repositories.find_user_by_email(session, email)
    if existing_user is not None and await repositories.find_membership(
        session, tontine.id, existing_user.id
    ):
        raise MembershipError("Cette personne possède déjà une adhésion", 409)
    now = datetime.now(UTC)
    pending = await repositories.find_pending_invitation(session, tontine.id, email)
    if pending is not None:
        if pending.expires_at > now:
            raise MembershipError(
                "Une invitation est déjà en attente pour cet e-mail", 409
            )
        pending.status = InvitationStatus.EXPIRED
        await session.flush()

    token = secrets.token_urlsafe(32)
    invitation = Invitation(
        tontine_id=tontine.id,
        email=email,
        role=payload.role,
        token_hash=hash_invitation_token(token),
        status=InvitationStatus.PENDING,
        invited_by_user_id=actor.id,
        expires_at=now + INVITATION_LIFETIME,
    )
    try:
        await repositories.insert_invitation(session, invitation)
        await session.commit()
        await session.refresh(invitation)
        return invitation, token
    except IntegrityError as error:
        await session.rollback()
        raise MembershipError(
            "Une invitation concurrente existe déjà pour cet e-mail", 409
        ) from error
    except Exception:
        await session.rollback()
        raise


async def list_invitations(
    session: AsyncSession, tontine_id: UUID, *, limit: int, offset: int
) -> tuple[list[Invitation], int]:
    now = datetime.now(UTC)
    try:
        await repositories.expire_pending_invitations(session, tontine_id, now)
        await session.commit()
        return await repositories.list_invitations(
            session, tontine_id, limit=limit, offset=offset
        )
    except Exception:
        await session.rollback()
        raise


async def revoke_invitation(
    session: AsyncSession,
    actor_membership: Membership,
    tontine: Tontine,
    invitation_id: UUID,
) -> Invitation:
    ensure_writable(tontine)
    try:
        invitation = await repositories.find_invitation(
            session, tontine.id, invitation_id, lock=True
        )
        if invitation is None:
            raise MembershipError("Invitation introuvable", 404)
        ensure_invitation_permission(actor_membership, invitation.role)
        if invitation.status != InvitationStatus.PENDING:
            raise MembershipError("Cette invitation n'est plus révocable", 409)
        now = datetime.now(UTC)
        if invitation.expires_at <= now:
            invitation.status = InvitationStatus.EXPIRED
            await session.commit()
            raise MembershipError("Cette invitation a expiré", 409)
        invitation.status = InvitationStatus.REVOKED
        invitation.revoked_at = now
        await session.commit()
        await session.refresh(invitation)
        return invitation
    except MembershipError:
        if session.in_transaction():
            await session.rollback()
        raise
    except Exception:
        await session.rollback()
        raise


async def accept_invitation(
    session: AsyncSession, actor: User, token: str
) -> Membership:
    try:
        invitation = await repositories.find_invitation_by_token_hash(
            session, hash_invitation_token(token), lock=True
        )
        if invitation is None:
            raise MembershipError("Token d'invitation invalide", 400)
        if invitation.status != InvitationStatus.PENDING:
            raise MembershipError(
                "Cette invitation a déjà été utilisée ou révoquée", 409
            )

        now = datetime.now(UTC)
        if invitation.expires_at <= now:
            invitation.status = InvitationStatus.EXPIRED
            await session.commit()
            raise MembershipError("Cette invitation a expiré", 409)
        if not actor.email or actor.email.casefold() != invitation.email.casefold():
            raise MembershipError(
                "Cette invitation appartient à une autre adresse e-mail", 403
            )

        tontine = await repositories.lock_tontine(session, invitation.tontine_id)
        if tontine is None:
            raise MembershipError("Tontine introuvable", 404)
        ensure_writable(tontine)
        if await repositories.find_membership(session, tontine.id, actor.id, lock=True):
            raise MembershipError(
                "Vous possédez déjà une adhésion à cette tontine", 409
            )
        active_count = await repositories.count_active_members(session, tontine.id)
        if tontine.max_members is not None and active_count >= tontine.max_members:
            raise MembershipError(
                "La capacité maximale de la tontine est atteinte", 409
            )

        membership = Membership(
            tontine_id=tontine.id,
            user_id=actor.id,
            role=invitation.role,
            status=MembershipStatus.ACTIVE,
        )
        await repositories.insert_membership(session, membership)
        invitation.status = InvitationStatus.ACCEPTED
        invitation.accepted_at = now
        invitation.accepted_by_user_id = actor.id
        await session.commit()
        await session.refresh(membership)
        return membership
    except MembershipError:
        if session.in_transaction():
            await session.rollback()
        raise
    except Exception:
        await session.rollback()
        raise


async def list_members(
    session: AsyncSession, tontine_id: UUID, *, limit: int, offset: int
) -> tuple[list[Membership], int]:
    return await repositories.list_memberships(
        session, tontine_id, limit=limit, offset=offset
    )


async def change_member_role(
    session: AsyncSession,
    tontine: Tontine,
    user_id: UUID,
    payload: MembershipRoleUpdate,
) -> Membership:
    ensure_writable(tontine)
    if payload.role == MembershipRole.OWNER:
        raise MembershipError("Utilisez le transfert de propriété", 400)
    try:
        membership = await repositories.find_membership_by_id(
            session, tontine.id, user_id, lock=True
        )
        if membership is None:
            raise MembershipError("Membre introuvable", 404)
        if membership.status != MembershipStatus.ACTIVE:
            raise MembershipError("L'adhésion n'est pas active", 409)
        if membership.role == MembershipRole.OWNER:
            raise MembershipError(
                "Le rôle du propriétaire se modifie par transfert", 409
            )
        membership.role = payload.role
        await session.commit()
        await session.refresh(membership)
        return membership
    except MembershipError:
        await session.rollback()
        raise
    except Exception:
        await session.rollback()
        raise


async def transfer_ownership(
    session: AsyncSession,
    tontine: Tontine,
    current_owner: Membership,
    new_owner_user_id: UUID,
) -> Membership:
    ensure_writable(tontine)
    if current_owner.user_id == new_owner_user_id:
        raise MembershipError("Cet utilisateur est déjà propriétaire", 409)
    try:
        await repositories.lock_tontine(session, tontine.id)
        locked_owner = await repositories.find_membership(
            session, tontine.id, current_owner.user_id, active_only=True, lock=True
        )
        target = await repositories.find_membership(
            session, tontine.id, new_owner_user_id, active_only=True, lock=True
        )
        if locked_owner is None or locked_owner.role != MembershipRole.OWNER:
            raise MembershipError("Le propriétaire actif a changé", 409)
        if target is None:
            raise MembershipError(
                "Le nouveau propriétaire doit être un membre actif", 404
            )
        locked_owner.role = MembershipRole.MEMBER
        await session.flush()
        target.role = MembershipRole.OWNER
        await session.commit()
        await session.refresh(target)
        return target
    except MembershipError:
        await session.rollback()
        raise
    except Exception:
        await session.rollback()
        raise


async def leave_tontine(
    session: AsyncSession, tontine: Tontine, membership: Membership
) -> Membership:
    ensure_writable(tontine)
    if membership.role == MembershipRole.OWNER:
        raise MembershipError(
            "Transférez la propriété avant de quitter la tontine", 409
        )
    try:
        locked = await repositories.find_membership(
            session, tontine.id, membership.user_id, active_only=True, lock=True
        )
        if locked is None:
            raise MembershipError("Adhésion active introuvable", 404)
        locked.status = MembershipStatus.LEFT
        locked.ended_at = datetime.now(UTC)
        await session.commit()
        await session.refresh(locked)
        return locked
    except MembershipError:
        await session.rollback()
        raise
    except Exception:
        await session.rollback()
        raise


async def remove_member(
    session: AsyncSession,
    tontine: Tontine,
    actor_membership: Membership,
    user_id: UUID,
) -> Membership:
    ensure_writable(tontine)
    if actor_membership.user_id == user_id:
        if actor_membership.role == MembershipRole.OWNER:
            raise MembershipError("Le propriétaire ne peut pas être retiré", 409)
        raise MembershipError("Utilisez la route de départ volontaire", 400)
    try:
        target = await repositories.find_membership(
            session, tontine.id, user_id, active_only=True, lock=True
        )
        if target is None:
            raise MembershipError("Membre actif introuvable", 404)
        if target.role == MembershipRole.OWNER:
            raise MembershipError("Le propriétaire ne peut pas être retiré", 409)
        if (
            actor_membership.role == MembershipRole.MANAGER
            and target.role != MembershipRole.MEMBER
        ):
            raise MembershipError(
                "Un manager peut seulement retirer un membre standard", 403
            )
        if actor_membership.role not in {MembershipRole.OWNER, MembershipRole.MANAGER}:
            raise MembershipError("Rôle interne insuffisant", 403)
        target.status = MembershipStatus.REMOVED
        target.ended_at = datetime.now(UTC)
        await session.commit()
        await session.refresh(target)
        return target
    except MembershipError:
        await session.rollback()
        raise
    except Exception:
        await session.rollback()
        raise
