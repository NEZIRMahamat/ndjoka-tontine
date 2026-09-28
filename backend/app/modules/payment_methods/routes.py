from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.payment_methods import services
from app.modules.payment_methods.schemas import (
    PaymentMethodCreate,
    PaymentMethodList,
    PaymentMethodRead,
)
from app.modules.users.dependencies import get_current_active_user
from app.modules.users.models import User


async def domain_errors() -> AsyncIterator[None]:
    try:
        yield
    except services.PaymentMethodError as error:
        raise HTTPException(error.status_code, error.detail) from error


router = APIRouter(
    prefix="/me/payment-methods",
    tags=["moyens de paiement"],
    dependencies=[Depends(domain_errors)],
    responses={
        401: {"description": "Token absent ou invalide"},
        403: {"description": "Compte non actif"},
        404: {"description": "Moyen de paiement introuvable"},
    },
)
Session = Annotated[AsyncSession, Depends(get_db_session)]
Actor = Annotated[User, Depends(get_current_active_user)]


@router.get("", response_model=PaymentMethodList, summary="Mes moyens de paiement")
async def list_mine(session: Session, actor: Actor) -> PaymentMethodList:
    items = await services.list_methods(session, actor)
    return PaymentMethodList(
        items=[PaymentMethodRead.model_validate(item) for item in items],
        total=len(items),
    )


@router.post(
    "",
    response_model=PaymentMethodRead,
    status_code=status.HTTP_201_CREATED,
    summary="Déclarer un moyen de paiement (référence masquée)",
)
async def add(
    payload: PaymentMethodCreate, session: Session, actor: Actor
) -> PaymentMethodRead:
    return PaymentMethodRead.model_validate(
        await services.add_method(session, actor, payload)
    )


@router.post(
    "/{method_id}/default",
    response_model=PaymentMethodRead,
    summary="Définir le moyen de paiement par défaut",
)
async def make_default(
    method_id: UUID, session: Session, actor: Actor
) -> PaymentMethodRead:
    return PaymentMethodRead.model_validate(
        await services.set_default(session, actor, method_id)
    )


@router.delete(
    "/{method_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Supprimer un moyen de paiement",
)
async def remove(method_id: UUID, session: Session, actor: Actor) -> Response:
    await services.remove_method(session, actor, method_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
