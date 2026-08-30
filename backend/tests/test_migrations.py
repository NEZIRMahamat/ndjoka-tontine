from io import StringIO
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

from alembic import command
from app.core.config import get_database_settings

BACKEND_ROOT = Path(__file__).resolve().parents[1]
ALEMBIC_CONFIG_PATH = BACKEND_ROOT / "alembic.ini"
ALEMBIC_DIRECTORY = BACKEND_ROOT / "alembic"
TEST_DATABASE_URL = "postgresql+asyncpg://ndjoka:p%25ss@localhost/ndjoka_test"


def build_alembic_config() -> Config:
    """Charger la configuration en gardant le SQL généré dans les tests."""
    return Config(
        ALEMBIC_CONFIG_PATH,
        stdout=StringIO(),
        output_buffer=StringIO(),
    )


def test_alembic_structure_is_configured_without_credentials() -> None:
    config = build_alembic_config()
    scripts = ScriptDirectory.from_config(config)

    assert Path(scripts.dir).resolve() == ALEMBIC_DIRECTORY
    assert (ALEMBIC_DIRECTORY / "env.py").is_file()
    assert (ALEMBIC_DIRECTORY / "script.py.mako").is_file()
    assert (ALEMBIC_DIRECTORY / "versions").is_dir()
    assert config.get_main_option("sqlalchemy.url") is None


def test_alembic_offline_environment_uses_database_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    get_database_settings.cache_clear()

    try:
        config = build_alembic_config()
        command.upgrade(config, "head", sql=True)
        upgrade_sql = config.output_buffer.getvalue()
    finally:
        get_database_settings.cache_clear()

    assert "CREATE TABLE users" in upgrade_sql
    assert "id UUID DEFAULT gen_random_uuid() NOT NULL" in upgrade_sql
    assert "auth0_sub VARCHAR(255) NOT NULL" in upgrade_sql
    assert "email VARCHAR(255)" in upgrade_sql
    assert "status VARCHAR(30) DEFAULT 'active' NOT NULL" in upgrade_sql
    assert "TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL" in upgrade_sql
    assert "CONSTRAINT pk_users PRIMARY KEY (id)" in upgrade_sql
    assert "CONSTRAINT ck_users_status CHECK" in upgrade_sql
    assert "CONSTRAINT uq_users_auth0_sub UNIQUE (auth0_sub)" in upgrade_sql
