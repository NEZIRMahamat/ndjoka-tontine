from uuid import UUID, uuid4

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_cors_settings
from app.core.request_context import request_id_context

app = FastAPI(
    title="Ndjoka Tontine API",
    description="API Ndjoka - Plateforme de tontine digitale",
    version="0.9.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_settings().cors_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "PATCH", "POST", "PUT"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)


@app.middleware("http")
async def add_request_id(request: Request, call_next) -> Response:
    try:
        request_id = UUID(request.headers.get("X-Request-ID", ""))
    except ValueError:
        request_id = uuid4()
    token = request_id_context.set(request_id)
    request.state.request_id = request_id
    try:
        response = await call_next(request)
        response.headers["X-Request-ID"] = str(request_id)
        return response
    finally:
        request_id_context.reset(token)


@app.get("/", tags=["meta"], summary="Présentation de l'API")
async def read_root() -> dict[str, str]:
    """Réponse minimale confirmant que l'API est accessible."""
    return {
        "description": "Ndjoka Tontine API",
        "version": "0.9.0",
        "documentation": "/docs",
    }


app.include_router(api_router, prefix="/api/v1")
