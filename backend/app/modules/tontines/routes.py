from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.memberships.dependencies import OwnerMembership
from app.modules.tontines import services
from app.modules.tontines.enums import TontineStatus
from app.modules.tontines.schemas import (
    TontineCreate,
    TontineList,
    TontineRead,
    TontineUpdate,
)
from app.modules.users.dependencies import get_current_active_user
from app.modules.users.models import User


async def domain_errors() -> AsyncIterator[None]:
    try:
        yield
    except services.TontineError as error:
        raise HTTPException(error.status_code, error.detail) from error


router = APIRouter(
    prefix="/tontines",
    tags=["tontines"],
    dependencies=[Depends(domain_errors)],
    responses={
        401: {"description": "Token absent ou invalide"},
        403: {"description": "Compte non actif"},
        404: {
            "description": "Tontine inexistante ou appartenant à un autre utilisateur"
        },
    },
)
Session = Annotated[AsyncSession, Depends(get_db_session)]
Actor = Annotated[User, Depends(get_current_active_user)]


@router.post(
    "",
    response_model=TontineRead,
    status_code=201,
    summary="Créer une tontine en brouillon",
)
async def create(
    payload: TontineCreate, session: Session, actor: Actor, response: Response
) -> TontineRead:
    tontine = await services.create_tontine(session, actor, payload)
    response.headers["Location"] = f"/api/v1/tontines/{tontine.id}"
    return TontineRead.model_validate(tontine)


@router.get("", response_model=TontineList, summary="Lister mes tontines")
async def list_mine(
    session: Session,
    actor: Actor,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    status: TontineStatus | None = None,
) -> TontineList:
    items, total = await services.list_tontines(
        session, actor, limit=limit, offset=offset, status=status
    )
    return TontineList(
        items=[TontineRead.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{tontine_id}", response_model=TontineRead, summary="Consulter ma tontine")
async def read(tontine_id: UUID, session: Session, actor: Actor) -> TontineRead:
    return TontineRead.model_validate(
        await services.get_tontine(session, actor, tontine_id)
    )


@router.patch(
    "/{tontine_id}",
    response_model=TontineRead,
    summary="Modifier ma tontine",
    responses={
        400: {"description": "Modification vide"},
        409: {"description": "Tontine archivée ou devise active immuable"},
    },
)
async def update(
    tontine_id: UUID,
    payload: TontineUpdate,
    session: Session,
    actor: Actor,
    owner: OwnerMembership,
) -> TontineRead:
    del owner
    return TontineRead.model_validate(
        await services.update_tontine(session, actor, tontine_id, payload)
    )


@router.post(
    "/{tontine_id}/archive",
    response_model=TontineRead,
    summary="Archiver ma tontine (idempotent)",
)
async def archive(
    tontine_id: UUID, session: Session, actor: Actor, owner: OwnerMembership
) -> TontineRead:
    del owner
    return TontineRead.model_validate(
        await services.archive_tontine(session, actor, tontine_id)
    )
