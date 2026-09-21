import argparse
import asyncio

from app.core.config import get_email_settings
from app.db.session import get_session_factory
from app.modules.notifications.email import build_provider
from app.modules.notifications.service import process_outbox_once


async def run_once(limit: int) -> int:
    settings = get_email_settings()
    provider = build_provider(settings)
    async with get_session_factory()() as session:
        return await process_outbox_once(session, provider, settings, limit=limit)


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
