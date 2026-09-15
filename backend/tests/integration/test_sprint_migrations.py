import asyncio
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from app.core.config import get_database_settings

pytestmark = pytest.mark.integration


def test_sprints_4_to_6_migration_roundtrip(test_database_url, monkeypatch):
    """Only the guarded disposable test DB; no local-dev or remote migration."""
    config = Config(Path(__file__).resolve().parents[2] / "alembic.ini")
    monkeypatch.setenv("DATABASE_URL", test_database_url)
    get_database_settings.cache_clear()

    async def table_names():
        engine = create_async_engine(test_database_url)
        try:
            async with engine.connect() as conn:
                return await conn.run_sync(lambda sync: inspect(sync).get_table_names())
        finally:
            await engine.dispose()

    try:
        command.downgrade(config, "b81e6c3d4f20")
        names = asyncio.run(table_names())
        assert "users" in names and "memberships" in names
        assert not {"cycles", "cycle_turns", "contributions", "payouts"} & set(names)
        command.upgrade(config, "head")
        assert {"cycles", "cycle_turns", "contributions", "payouts"} <= set(
            asyncio.run(table_names())
        )
        command.check(config)
    finally:
        command.upgrade(config, "head")
        get_database_settings.cache_clear()
