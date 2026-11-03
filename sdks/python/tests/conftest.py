from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import AsyncIterator, Iterator, List

import pytest
import respx

sys.path.insert(0, str(Path(__file__).parent))

import maitento  # noqa: E402
from helpers import API_KEY, BASE  # noqa: E402
from maitento import _aio, _sio  # noqa: E402


@pytest.fixture
def sleeps(monkeypatch: pytest.MonkeyPatch) -> List[float]:
    """Records retry/poll waits instead of sleeping (both clients)."""
    recorded: List[float] = []

    def fake_sleep(seconds: float) -> None:
        recorded.append(seconds)

    async def fake_async_sleep(seconds: float) -> None:
        recorded.append(seconds)
        await asyncio.sleep(0)

    monkeypatch.setattr(_sio, "sleep", fake_sleep)
    monkeypatch.setattr(_aio, "sleep", fake_async_sleep)
    return recorded


@pytest.fixture
def mock() -> Iterator[respx.MockRouter]:
    with respx.mock(base_url=BASE, assert_all_called=False) as router:
        yield router


@pytest.fixture
def client(sleeps: List[float]) -> Iterator[maitento.Maitento]:
    mt = maitento.Maitento(API_KEY, base_url=BASE, namespace="demo", environ={})
    yield mt
    mt.close()


@pytest.fixture
async def aclient(sleeps: List[float]) -> AsyncIterator[maitento.AsyncMaitento]:
    mt = maitento.AsyncMaitento(API_KEY, base_url=BASE, namespace="demo", environ={})
    yield mt
    await mt.close()
