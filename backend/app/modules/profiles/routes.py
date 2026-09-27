from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.profiles import services
from app.modules.profiles.ml_reliability import (
    ReliabilityPredictionRead,
    get_predicted_reliability,
)
from app.modules.profiles.reliability import get_reliability
from app.modules.profiles.schemas import (
    ReliabilityRead,
    SaverProfileInput,
    SaverProfileRead,
)
from app.modules.users.dependencies import get_current_active_user
from app.modules.users.models import User

router = APIRouter(
    prefix="/me",
    tags=["profil épargnant"],
    responses={
        401: {"description": "Token absent ou invalide"},
        403: {"description": "Compte non actif"},
    },
)
Session = Annotated[AsyncSession, Depends(get_db_session)]
Actor = Annotated[User, Depends(get_current_active_user)]


@router.get(
    "/saver-profile",
    response_model=SaverProfileRead,
    summary="Consulter mon profil d'épargnant",
    responses={404: {"description": "Profil non renseigné"}},
)
async def read_profile(session: Session, actor: Actor) -> SaverProfileRead:
    profile = await services.get_profile(session, actor)
    if profile is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Profil d'épargnant non renseigné"
        )
    return SaverProfileRead.model_validate(profile)


@router.put(
    "/saver-profile",
    response_model=SaverProfileRead,
    summary="Enregistrer mon profil d'épargnant",
)
async def save_profile(
    payload: SaverProfileInput, session: Session, actor: Actor
) -> SaverProfileRead:
    profile = await services.save_profile(session, actor, payload)
    return SaverProfileRead.model_validate(profile)


@router.delete(
    "/saver-profile",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Supprimer mon profil d'épargnant",
)
async def delete_profile(session: Session, actor: Actor) -> Response:
    await services.remove_profile(session, actor)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/reliability",
    response_model=ReliabilityRead,
    summary="Consulter mon score de fiabilité",
)
async def read_reliability(session: Session, actor: Actor) -> ReliabilityRead:
    return await get_reliability(session, actor.id)


@router.get(
    "/reliability/prediction",
    response_model=ReliabilityPredictionRead,
    summary="Prédire ma fiabilité avec le modèle Ndjoka AI",
    description=(
        "Estime la probabilité de retard ou d'impayé à partir de l'historique "
        "et du profil d'épargnant (régression logistique). Sans montant, la "
        "cotisation est supposée égale à 50 % de la capacité mensuelle."
    ),
)
async def read_reliability_prediction(
    session: Session,
    actor: Actor,
    contribution_amount: Annotated[
        Decimal | None,
        Query(gt=0, description="Montant d'une cotisation envisagée"),
    ] = None,
    frequency: Annotated[
        Literal["weekly", "monthly"],
        Query(description="Fréquence de la cotisation envisagée"),
    ] = "monthly",
) -> ReliabilityPredictionRead:
    return await get_predicted_reliability(
        session,
        actor,
        contribution_amount=contribution_amount,
        frequency=frequency,
    )
