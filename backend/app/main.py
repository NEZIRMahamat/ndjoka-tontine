import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID, uuid4

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_cors_settings, get_email_settings
from app.core.request_context import request_id_context
from app.modules.notifications.dispatcher import dispatcher
from app.workers.notifications import run_once_safely

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Traiter l'Outbox notifications pendant toute la vie du processus."""
    try:
        settings = get_email_settings()
        dispatcher.start(
            run_once_safely,
            interval=settings.outbox_poll_interval_seconds,
            limit=settings.outbox_batch_limit,
        )
    except Exception:
        logger.exception(
            "Dispatcher Outbox non démarré : configuration e-mail invalide"
        )
    try:
        yield
    finally:
        await dispatcher.stop()


app = FastAPI(
    title="Ndjoka Tontine API",
    description="API Ndjoka - Plateforme de tontine digitale",
    version="0.9.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_settings().cors_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "PATCH", "POST", "PUT", "DELETE"],
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
