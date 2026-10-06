"""Traitement de l'Outbox depuis le processus API.

Le Web Service ne dispose pas d'ordonnanceur externe : sans ce dispatcher,
les événements Outbox restaient en ``pending`` et aucun e-mail ne partait.
Le dispatcher tourne en tâche de fond asyncio, se réveille à intervalle
régulier et immédiatement après chaque commit ayant produit un événement.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

OutboxRunner = Callable[[int], Awaitable[int]]


class OutboxDispatcher:
    def __init__(self) -> None:
        self._runner: OutboxRunner | None = None
        self._task: asyncio.Task[None] | None = None
        self._wakeup: asyncio.Event | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._interval = 0.0
        self._limit = 50

    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()

    def start(self, runner: OutboxRunner, *, interval: float, limit: int) -> None:
        """Démarrer la boucle ; ``interval <= 0`` laisse le dispatcher inactif."""
        if self.running or interval <= 0:
            return
        self._runner = runner
        self._interval = interval
        self._limit = limit
        self._loop = asyncio.get_running_loop()
        self._wakeup = asyncio.Event()
        self._task = self._loop.create_task(self._run(), name="outbox-dispatcher")

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task is None:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        self._wakeup = None
        self._loop = None

    def notify(self) -> None:
        """Demander un traitement immédiat ; sans effet si inactif."""
        if not self.running or self._loop is None or self._wakeup is None:
            return
        self._loop.call_soon_threadsafe(self._wakeup.set)

    def notify_after_commit(self, session: AsyncSession) -> None:
        """Réveiller le dispatcher une fois la transaction courante validée."""
        if not self.running:
            return
        sync_session = getattr(session, "sync_session", None)
        if sync_session is None:
            return
        event.listen(sync_session, "after_commit", self._on_commit, once=True)

    def _on_commit(self, _session: object) -> None:
        self.notify()

    async def _run(self) -> None:
        assert self._wakeup is not None
        while True:
            try:
                await asyncio.wait_for(self._wakeup.wait(), timeout=self._interval)
            except TimeoutError:
                pass
            self._wakeup.clear()
            await self._drain()

    async def _drain(self) -> None:
        assert self._runner is not None
        while True:
            try:
                processed = await self._runner(self._limit)
            except Exception:
                logger.exception("Traitement de l'Outbox notifications impossible")
                return
            if processed < self._limit:
                return


dispatcher = OutboxDispatcher()
