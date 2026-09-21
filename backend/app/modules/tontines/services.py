from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.services import change, record
from app.modules.memberships.enums import MembershipRole, MembershipStatus
from app.modules.memberships.models import Membership
from app.modules.memberships.repositories import insert_membership
from app.modules.tontines import repositories
from app.modules.tontines.enums import TontineStatus
from app.modules.tontines.models import Tontine
from app.modules.tontines.schemas import TontineCreate, TontineUpdate
from app.modules.users.enums import UserStatus
from app.modules.users.models import User


class TontineError(Exception):
    def __init__(self, detail: str, status_code: int) -> None:
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


def require_active(actor: User) -> None:
    if actor.status != UserStatus.ACTIVE:
        raise TontineError("Compte Ndjoka non actif", 403)


async def get_tontine(
    session: AsyncSession, actor: User, tontine_id: UUID, *, lock: bool = False
) -> Tontine:
    require_active(actor)
    tontine = await repositories.find_accessible_tontine(
        session, tontine_id, actor.id, lock=lock
    )
    if tontine is None:
        raise TontineError("Tontine introuvable", 404)
    return tontine


async def list_tontines(
    session: AsyncSession,
    actor: User,
    *,
    limit: int,
    offset: int,
    status: TontineStatus | None = None,
) -> tuple[list[Tontine], int]:
    require_active(actor)
    return await repositories.list_accessible_tontines(
        session, actor.id, limit=limit, offset=offset, status=status
    )


async def create_tontine(
    session: AsyncSession, actor: User, payload: TontineCreate
) -> Tontine:
    require_active(actor)
    tontine = Tontine(
        **payload.model_dump(), created_by_user_id=actor.id, status=TontineStatus.DRAFT
    )
    try:
        await repositories.insert_tontine(session, tontine)
        await insert_membership(
            session,
            Membership(
                tontine_id=tontine.id,
                user_id=actor.id,
                role=MembershipRole.OWNER,
                status=MembershipStatus.ACTIVE,
            ),
        )
        await record(
            session,
            event_name="tontine.created",
            actor_user_id=actor.id,
            subject_user_id=actor.id,
            tontine_id=tontine.id,
            resource_type="tontine",
            resource_id=tontine.id,
            changes={
                "name": {"to": tontine.name},
                "currency": {"to": tontine.currency},
                "max_members": {"to": tontine.max_members},
                "status": {"to": tontine.status.value},
            },
        )
        await session.commit()
        await session.refresh(tontine)
        return tontine
    except Exception:
        await session.rollback()
        raise


async def update_tontine(
    session: AsyncSession, actor: User, tontine_id: UUID, payload: TontineUpdate
) -> Tontine:
    try:
        tontine = await get_tontine(session, actor, tontine_id, lock=True)
        if tontine.status == TontineStatus.ARCHIVED:
            raise TontineError("Une tontine archivée est en lecture seule", 409)
        changes = payload.model_dump(exclude_unset=True)
        if not changes:
            raise TontineError("Au moins un champ doit être fourni", 400)
        if (
            tontine.status == TontineStatus.ACTIVE
            and changes.get("currency", tontine.currency) != tontine.currency
        ):
            raise TontineError(
                "La devise ne peut plus être modifiée après activation", 409
            )
        audit_changes = {}
        for field, value in changes.items():
            old_value = getattr(tontine, field)
            if old_value != value:
                audit_changes[field] = (
                    change(old_value is not None, value is not None)
                    if field == "description"
                    else change(old_value, value)
                )
            setattr(tontine, field, value)
        if audit_changes:
            await record(
                session,
                event_name="tontine.updated",
                actor_user_id=actor.id,
                subject_user_id=actor.id,
                tontine_id=tontine.id,
                resource_type="tontine",
                resource_id=tontine.id,
                changes=audit_changes,
            )
        await session.commit()
        await session.refresh(tontine)
        return tontine
    except Exception:
        await session.rollback()
        raise


async def archive_tontine(
    session: AsyncSession, actor: User, tontine_id: UUID
) -> Tontine:
    try:
        tontine = await get_tontine(session, actor, tontine_id, lock=True)
        if tontine.status != TontineStatus.ARCHIVED:
            old_status = tontine.status
            tontine.status = TontineStatus.ARCHIVED
            tontine.archived_at = datetime.now(UTC)
            await record(
                session,
                event_name="tontine.archived",
                actor_user_id=actor.id,
                subject_user_id=actor.id,
                tontine_id=tontine.id,
                resource_type="tontine",
                resource_id=tontine.id,
                changes={"status": change(old_status, tontine.status)},
            )
        await session.commit()
        await session.refresh(tontine)
        return tontine
    except Exception:
        await session.rollback()
        raise
