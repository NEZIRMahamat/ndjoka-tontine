import asyncio
from types import TracebackType

import pytest
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import DatabaseSettings, get_database_settings
from app.db import session as database_session
from app.db.base import NAMING_CONVENTION, Base

TEST_DATABASE_URL = "postgresql+asyncpg://ndjoka:secret@127.0.0.1:5433/ndjoka_test"


class StubSession:
    """Contexte asynchrone minimal pour tester la dépendance sans PostgreSQL."""

    def __init__(self) -> None:
        self.entered = False
        self.exited = False
        self.commit_calls = 0
        self.rollback_calls = 0
        self.exit_exception_type: type[BaseException] | None = None

    async def __aenter__(self) -> "StubSession":
        self.entered = True
        return self

    async def __aexit__(
        self,
        exception_type: type[BaseException] | None,
        exception: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.exited = True
        self.exit_exception_type = exception_type

    async def commit(self) -> None:
        self.commit_calls += 1

    async def rollback(self) -> None:
        self.rollback_calls += 1


class StubSessionFactory:
    def __init__(self) -> None:
        self.sessions: list[StubSession] = []

    def __call__(self) -> StubSession:
        session = StubSession()
        self.sessions.append(session)
        return session


def test_database_settings_loads_and_hides_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    get_database_settings.cache_clear()

    try:
        first_settings = get_database_settings()
        second_settings = get_database_settings()
    finally:
        get_database_settings.cache_clear()

    assert first_settings is second_settings
    assert first_settings.database_url.get_secret_value() == TEST_DATABASE_URL
    assert "secret" not in repr(first_settings)


@pytest.mark.parametrize("scheme", ["postgresql", "postgres"])
def test_database_settings_normalizes_render_url(scheme: str) -> None:
    settings = DatabaseSettings(
        database_url=f"{scheme}://ndjoka:secret@db.example.com/ndjoka",
    )

    assert settings.database_url.get_secret_value() == (
        "postgresql+asyncpg://ndjoka:secret@db.example.com/ndjoka"
    )


def test_database_settings_normalizes_render_external_sslmode() -> None:
    settings = DatabaseSettings(
        database_url=(
            "postgresql://ndjoka:secret@db.example.com/ndjoka?sslmode=require"
        ),
    )

    assert settings.database_url.get_secret_value() == (
        "postgresql+asyncpg://ndjoka:secret@db.example.com/ndjoka?ssl=require"
    )


def test_render_external_url_passes_ssl_to_asyncpg() -> None:
    settings = DatabaseSettings(
        database_url=(
            "postgresql://ndjoka:secret@db.example.com/ndjoka?sslmode=require"
        ),
    )
    engine = database_session.build_async_engine(
        settings.database_url.get_secret_value()
    )

    try:
        _, connect_args = engine.dialect.create_connect_args(engine.url)
    finally:
        asyncio.run(engine.dispose())

    assert connect_args["ssl"] == "require"
    assert "sslmode" not in connect_args


@pytest.mark.parametrize(
    "ssl_query",
    [
        "sslmode=invalid",
        "sslmode=require&sslmode=verify-full",
        "sslmode=require&ssl=verify-full",
    ],
)
def test_database_settings_rejects_invalid_ssl_query(ssl_query: str) -> None:
    with pytest.raises(ValidationError, match="DATABASE_URL|mode SSL"):
        DatabaseSettings(
            database_url=(
                "postgresql://ndjoka:secret@db.example.com/ndjoka?" + ssl_query
            ),
        )


@pytest.mark.parametrize(
    "database_url",
    [
        "sqlite+aiosqlite:///ndjoka.db",
        "postgresql+psycopg://ndjoka:secret@localhost/ndjoka",
        "postgresql+asyncpg://ndjoka:secret@/ndjoka",
    ],
)
def test_database_settings_rejects_unsupported_url(database_url: str) -> None:
    with pytest.raises(ValidationError, match="DATABASE_URL"):
        DatabaseSettings(database_url=database_url)


def test_base_uses_stable_constraint_names() -> None:
    assert Base.metadata.naming_convention == NAMING_CONVENTION
    assert set(NAMING_CONVENTION) == {"pk", "fk", "uq", "ix", "ck"}


def test_engine_and_session_factory_are_async() -> None:
    engine = database_session.build_async_engine(TEST_DATABASE_URL)
    session_factory = database_session.build_session_factory(engine)
    session = session_factory()

    try:
        assert engine.url.drivername == "postgresql+asyncpg"
        assert engine.pool._pre_ping is True
        assert isinstance(session, AsyncSession)
        assert session.bind is engine
        assert session.sync_session.expire_on_commit is False
    finally:
        asyncio.run(session.close())
        asyncio.run(engine.dispose())


def test_engine_and_session_factory_are_created_lazily_and_cached(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = DatabaseSettings(database_url=TEST_DATABASE_URL)
    monkeypatch.setattr(
        database_session,
        "get_database_settings",
        lambda: settings,
    )
    database_session.get_session_factory.cache_clear()
    database_session.get_async_engine.cache_clear()

    try:
        first_engine = database_session.get_async_engine()
        second_engine = database_session.get_async_engine()
        first_factory = database_session.get_session_factory()
        second_factory = database_session.get_session_factory()

        assert first_engine is second_engine
        assert first_factory is second_factory
    finally:
        database_session.get_session_factory.cache_clear()
        asyncio.run(first_engine.dispose())
        database_session.get_async_engine.cache_clear()


def test_db_dependency_creates_and_closes_one_session_per_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session_factory = StubSessionFactory()
    monkeypatch.setattr(
        database_session,
        "get_session_factory",
        lambda: session_factory,
    )

    async def consume_two_sessions() -> list[StubSession]:
        provided_sessions: list[StubSession] = []
        for _ in range(2):
            async for session in database_session.get_db_session():
                provided_sessions.append(session)
        return provided_sessions

    provided_sessions = asyncio.run(consume_two_sessions())

    assert len(provided_sessions) == 2
    assert provided_sessions[0] is not provided_sessions[1]
    assert all(session.entered for session in session_factory.sessions)
    assert all(session.exited for session in session_factory.sessions)
    assert all(session.commit_calls == 0 for session in session_factory.sessions)
    assert all(session.rollback_calls == 0 for session in session_factory.sessions)


def test_db_dependency_rolls_back_on_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session_factory = StubSessionFactory()
    monkeypatch.setattr(
        database_session,
        "get_session_factory",
        lambda: session_factory,
    )

    async def raise_inside_dependency() -> None:
        session_generator = database_session.get_db_session()
        await anext(session_generator)
        await session_generator.athrow(RuntimeError("test error"))

    with pytest.raises(RuntimeError, match="test error"):
        asyncio.run(raise_inside_dependency())

    session = session_factory.sessions[0]
    assert session.rollback_calls == 1
    assert session.commit_calls == 0
    assert session.exited is True
    assert session.exit_exception_type is RuntimeError
