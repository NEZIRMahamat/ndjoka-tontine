"""Réinitialiser une base Ndjoka (dev ou prod), puis rejouer migrations et démo.

    uv run python -m app.seed.reset --env dev --yes
    uv run python -m app.seed.reset --env prod --yes --presenter "auth0|xxx:Nom"

Étapes : sauvegarde ``pg_dump`` (sauf ``--no-backup``), suppression du schéma
``public``, ``alembic upgrade head``, puis chargement du jeu de démonstration
(sauf ``--no-seed``). L'environnement est choisi par ``--env`` et appliqué via
``APP_ENV`` avant tout chargement de configuration.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Réinitialiser la base Ndjoka")
    parser.add_argument("--env", choices=("dev", "prod"), required=True)
    parser.add_argument("--yes", action="store_true", help="Confirmer la suppression")
    parser.add_argument("--no-backup", action="store_true")
    parser.add_argument("--no-seed", action="store_true")
    parser.add_argument(
        "--backup-dir", default=str(BACKEND_ROOT / "backups"), help="Dossier des dumps"
    )
    parser.add_argument("--presenter", action="append", default=None)
    return parser.parse_args()


def libpq_url(async_url: str) -> str:
    url = async_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    return url.replace("?ssl=", "?sslmode=").replace("&ssl=", "&sslmode=")


async def backup_json(async_url: str, target: Path) -> None:
    """Export logique de toutes les tables (JSON), indépendant de la version serveur."""
    import json

    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool

    engine = create_async_engine(async_url, poolclass=NullPool)
    payload: dict[str, list[dict]] = {}
    try:
        async with engine.connect() as connection:
            tables = [
                row[0]
                for row in await connection.execute(
                    text(
                        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' "
                        "ORDER BY tablename"
                    )
                )
            ]
            for table in tables:
                rows = await connection.execute(text(f'SELECT * FROM "{table}"'))
                payload[table] = [dict(row._mapping) for row in rows]
    finally:
        await engine.dispose()
    target.write_text(json.dumps(payload, default=str, ensure_ascii=False, indent=1))


def backup(async_url: str, env: str, directory: Path) -> Path:
    """Sauvegarder avec pg_dump, ou en JSON si l'outil manque ou ne correspond pas."""
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    executable = shutil.which("pg_dump")
    if executable is not None:
        target = directory / f"ndjoka_{env}_{stamp}.dump"
        result = subprocess.run(
            [
                executable,
                "--format=custom",
                "--no-owner",
                "--file",
                str(target),
                libpq_url(async_url),
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            return target
        target.unlink(missing_ok=True)
        lines = result.stderr.strip().splitlines()
        detail = lines[-1] if lines else "erreur"
        print(
            f"pg_dump indisponible ({detail}) : export JSON de secours.",
            file=sys.stderr,
        )
    else:
        print("pg_dump introuvable : export JSON de secours.", file=sys.stderr)
    target = directory / f"ndjoka_{env}_{stamp}.json"
    asyncio.run(backup_json(async_url, target))
    return target


async def drop_schema(async_url: str) -> None:
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool

    engine = create_async_engine(
        async_url, poolclass=NullPool, isolation_level="AUTOCOMMIT"
    )
    try:
        async with engine.connect() as connection:
            await connection.exec_driver_sql("DROP SCHEMA public CASCADE")
            await connection.exec_driver_sql("CREATE SCHEMA public")
            await connection.exec_driver_sql("GRANT ALL ON SCHEMA public TO public")
    finally:
        await engine.dispose()


def migrate() -> None:
    from alembic.config import Config

    from alembic import command

    command.upgrade(Config(BACKEND_ROOT / "alembic.ini"), "head")


def main() -> None:
    arguments = parse_arguments()
    os.environ["APP_ENV"] = arguments.env

    from app.core.config import get_database_settings
    from app.seed.demo import default_presenters, parse_presenter
    from app.seed.demo import run as seed_run

    async_url = get_database_settings().database_url.get_secret_value()
    from sqlalchemy.engine import make_url

    parsed = make_url(async_url)
    print(
        f"Base ciblée : {parsed.host}:{parsed.port or 5432}/{parsed.database} ({arguments.env})"
    )
    if not arguments.yes:
        print("Ajoutez --yes pour confirmer la suppression de TOUTES les données.")
        raise SystemExit(2)

    if not arguments.no_backup:
        saved = backup(async_url, arguments.env, Path(arguments.backup_dir))
        print(f"Sauvegarde : {saved}")

    asyncio.run(drop_schema(async_url))
    print("Schéma public recréé.")
    migrate()
    print("Migrations appliquées (head).")

    if arguments.no_seed:
        return
    presenters = (
        [parse_presenter(value) for value in arguments.presenter]
        if arguments.presenter
        else default_presenters()
    )
    created = asyncio.run(seed_run(presenters))
    for key, count in sorted(created.items()):
        print(f"{key:>18} : {count}")
    print(f"Compte principal : {presenters[0].auth0_sub}")


if __name__ == "__main__":
    main()
