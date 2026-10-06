import argparse
import asyncio
import logging

from app.core.config import get_email_settings
from app.db.models import load_all_models
from app.db.session import get_session_factory
from app.modules.notifications.email import build_provider
from app.modules.notifications.service import process_outbox_once

logger = logging.getLogger(__name__)


async def run_once(limit: int) -> int:
    load_all_models()  # les mappers inter-modules doivent être résolus hors API
    settings = get_email_settings()
    provider = build_provider(settings)
    async with get_session_factory()() as session:
        return await process_outbox_once(session, provider, settings, limit=limit)


async def run_once_safely(limit: int) -> int:
    """Variante pour le dispatcher intégré : journaliser sans propager."""
    try:
        return await run_once(limit)
    except Exception:
        logger.exception("Traitement de l'Outbox notifications impossible")
        return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Traiter l'Outbox notifications")
    parser.add_argument(
        "--once", action="store_true", help="Traiter un lot puis quitter"
    )
    parser.add_argument("--limit", type=int, default=50)
    arguments = parser.parse_args()
    if not arguments.once:
        parser.error("Le MVP accepte uniquement --once")
    if not 1 <= arguments.limit <= 100:
        parser.error("--limit doit être compris entre 1 et 100")
    asyncio.run(run_once(arguments.limit))


if __name__ == "__main__":
    main()
