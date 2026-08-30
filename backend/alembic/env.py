import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context
from app.core.config import get_database_settings
from app.db.base import Base
from app.db.models import load_all_models

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

load_all_models()
target_metadata = Base.metadata


def get_database_url() -> str:
    """Lire l'URL depuis l'environnement sans l'inscrire dans Alembic."""
    return get_database_settings().database_url.get_secret_value()


def run_migrations_offline() -> None:
    """Générer le SQL des migrations sans ouvrir de connexion."""
    context.configure(
        url=get_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Exécuter les migrations avec une connexion asynchrone dédiée."""
    connectable = create_async_engine(
        get_database_url(),
        poolclass=pool.NullPool,
    )

    try:
        async with connectable.connect() as connection:
            await connection.run_sync(do_run_migrations)
    finally:
        await connectable.dispose()


def run_migrations_online() -> None:
    """Exécuter les migrations contre PostgreSQL."""

    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
