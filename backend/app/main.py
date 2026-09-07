from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_cors_settings

app = FastAPI(
    title="Ndjoka Tontine API",
    description="API Ndjoka - Plateforme de tontine digitale",
    version="0.4.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_settings().cors_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "PATCH", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/", tags=["meta"], summary="Présentation de l'API")
async def read_root() -> dict[str, str]:
    """Réponse minimale confirmant que l'API est accessible."""
    return {
        "description": "Ndjoka Tontine API",
        "version": "0.4.0",
        "documentation": "/docs",
    }


app.include_router(api_router, prefix="/api/v1")
