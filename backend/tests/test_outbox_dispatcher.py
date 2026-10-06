import asyncio

import pytest
from fastapi.testclient import TestClient

from app.core.config import EmailSettings
from app.main import app
from app.modules.notifications.dispatcher import OutboxDispatcher, dispatcher


class RecordingRunner:
    def __init__(self, results: list[int] | None = None) -> None:
        self.calls: list[int] = []
        self.results = results or []
        self.event = asyncio.Event()

    async def __call__(self, limit: int) -> int:
        self.calls.append(limit)
        self.event.set()
        return self.results.pop(0) if self.results else 0


async def wait_for(event: asyncio.Event) -> None:
    await asyncio.wait_for(event.wait(), timeout=2)
    event.clear()


def test_dispatcher_processes_on_notify() -> None:
    async def scenario() -> None:
        runner = RecordingRunner()
        unit = OutboxDispatcher()
        unit.start(runner, interval=3600, limit=20)
        assert unit.running
        unit.notify()
        await wait_for(runner.event)
        assert runner.calls == [20]
        await unit.stop()
        assert not unit.running

    asyncio.run(scenario())


def test_dispatcher_drains_full_batches_then_waits() -> None:
    async def scenario() -> None:
        runner = RecordingRunner(results=[5, 5, 2])
        unit = OutboxDispatcher()
        unit.start(runner, interval=3600, limit=5)
        unit.notify()
        for _ in range(50):
            if len(runner.calls) >= 3:
                break
            await asyncio.sleep(0.01)
        await asyncio.sleep(0.05)
        assert runner.calls == [5, 5, 5]
        await unit.stop()

    asyncio.run(scenario())


def test_dispatcher_polls_on_interval_and_survives_runner_errors() -> None:
    async def scenario() -> None:
        failures = 0

        async def runner(limit: int) -> int:
            nonlocal failures
            failures += 1
            raise RuntimeError("base indisponible")

        unit = OutboxDispatcher()
        unit.start(runner, interval=0.02, limit=5)
        await asyncio.sleep(0.15)
        assert unit.running
        assert failures >= 2
        await unit.stop()

    asyncio.run(scenario())


def test_dispatcher_disabled_when_interval_is_zero() -> None:
    async def scenario() -> None:
        runner = RecordingRunner()
        unit = OutboxDispatcher()
        unit.start(runner, interval=0, limit=5)
        assert not unit.running
        unit.notify()
        unit.notify_after_commit(object())  # type: ignore[arg-type]
        await asyncio.sleep(0.02)
        assert runner.calls == []
        await unit.stop()

    asyncio.run(scenario())


def test_notify_after_commit_ignores_sessions_without_sync_session() -> None:
    async def scenario() -> None:
        runner = RecordingRunner()
        unit = OutboxDispatcher()
        unit.start(runner, interval=3600, limit=5)
        unit.notify_after_commit(object())  # type: ignore[arg-type]
        await asyncio.sleep(0.02)
        assert runner.calls == []
        await unit.stop()

    asyncio.run(scenario())


def test_outbox_settings_defaults_and_validation() -> None:
    settings = EmailSettings(_env_file=None)
    assert settings.outbox_poll_interval_seconds == 30
    assert settings.outbox_batch_limit == 50
    with pytest.raises(ValueError):
        EmailSettings(_env_file=None, outbox_poll_interval_seconds=-1)
    with pytest.raises(ValueError):
        EmailSettings(_env_file=None, outbox_batch_limit=0)


def test_app_lifespan_starts_and_stops_dispatcher() -> None:
    with TestClient(app):
        assert dispatcher.running
    assert not dispatcher.running
