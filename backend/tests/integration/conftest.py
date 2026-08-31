import asyncio
import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic.config import Config
from pydantic import ValidationError
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command
from app.core.config import DatabaseSettings, get_database_settings

BACKEND_ROOT = Path(__file__).resolve().parents[2]
ALEMBIC_CONFIG_PATH = BACKEND_ROOT / "alembic.ini"
TEST_DATABASE_ENV = "TEST_DATABASE_URL"
EXPECTED_HOSTS = {"127.0.0.1", "localhost", "::1"}
EXPECTED_PORT = 5434
EXPECTED_DATABASE = "ndjoka_test"
EXPECTED_USER = "ndjoka_test"


def require_safe_test_database_url() -> str:
    """N'accepter que l'instance PostgreSQL éphémère réservée aux tests."""
    raw_url = os.getenv(TEST_DATABASE_ENV, "").strip()
    if not raw_url:
        pytest.skip(
            "TEST_DATABASE_URL absent : tests PostgreSQL ignorés. "
            "Voir backend/README.md.",
        )

    try:
        settings = DatabaseSettings(database_url=raw_url)
    except ValidationError:
        pytest.fail(
            "TEST_DATABASE_URL doit être une URL PostgreSQL valide",
            pytrace=False,
        )

    normalized_url = settings.database_url.get_secret_value()
    database_url = make_url(normalized_url)
    is_safe_target = (
        database_url.host in EXPECTED_HOSTS
        and database_url.port == EXPECTED_PORT
        and database_url.database == EXPECTED_DATABASE
        and database_url.username == EXPECTED_USER
    )
    if not is_safe_target:
        pytest.fail(
            "TEST_DATABASE_URL doit cibler exclusivement "
            "ndjoka_test@127.0.0.1:5434/ndjoka_test",
            pytrace=False,
        )

    return normalized_url


def upgrade_test_database(database_url: str) -> None:
    """Appliquer les migrations Alembic sans modifier la configuration locale."""
    previous_database_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = database_url
    get_database_settings.cache_clear()

    try:
        command.upgrade(Config(ALEMBIC_CONFIG_PATH), "head")
    finally:
        if previous_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous_database_url
        get_database_settings.cache_clear()


async def truncate_users(database_url: str) -> None:
    """Nettoyer uniquement la table de l'instance de test validée."""
    engine = create_async_engine(database_url, poolclass=NullPool)
    try:
        async with engine.begin() as connection:
            await connection.exec_driver_sql("TRUNCATE TABLE users CASCADE")
    finally:
        await engine.dispose()


@pytest.fixture(scope="session")
def migrated_test_database_url() -> str:
    database_url = require_safe_test_database_url()
    upgrade_test_database(database_url)
    return database_url


@pytest.fixture
def test_database_url(migrated_test_database_url: str) -> Iterator[str]:
    """Garantir une table users vide avant et après chaque scénario."""
    asyncio.run(truncate_users(migrated_test_database_url))
    try:
        yield migrated_test_database_url
    finally:
        asyncio.run(truncate_users(migrated_test_database_url))
