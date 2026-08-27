from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health", summary="Vérification état de l'API")
async def health_check() -> dict[str, str]:
    """Confirmer que le processus FastAPI répond aux requêtes HTTP."""
    return {"status": "ok"}
