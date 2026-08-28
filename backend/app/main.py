from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_cors_settings

app = FastAPI(
    title="Ndjoka Tontine API",
    description="API Ndjoka - Plateforme de tontine digitale",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_settings().cors_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["Authorization"],
)


@app.get("/", tags=["meta"], summary="Présentation de l'API")
async def read_root() -> dict[str, str]:
    """Réponse minimale confirmant que l'API est accessible."""
    return {
        "description": "Ndjoka Tontine API",
        "version": "0.1.0",  # Version de l'API flexible et évolutive (plus tard dans config.py)
        "documentation": "/docs",
    }


app.include_router(api_router, prefix="/api/v1")
