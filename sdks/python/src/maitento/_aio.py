"""Concurrency primitives for the asyncio code in ``maitento/_async``.

``scripts/unasync.py`` turns ``_async/*`` into ``_sync/*`` by rewriting tokens, one of which is this module's name
(``_aio`` becomes ``_sio``). So :mod:`maitento._sio` must offer exactly these names, with blocking semantics.
Code reaches them as ``_aio.sleep(...)`` (not ``from _aio import sleep``) so tests can patch them.
"""

from __future__ import annotations

import asyncio
import inspect
import time
from typing import Any, Awaitable, Callable, TypeVar, Union, cast

T = TypeVar("T")

Lock = asyncio.Lock
"""The lock guarding a client's JWT renewal."""

Event = asyncio.Event
"""The type of the ``abort`` signal a ``run()`` helper accepts."""

CancelledError = asyncio.CancelledError
"""What cancelling a ``run()`` helper raises inside it (``kill_on_abort`` kills the run on it)."""


async def sleep(seconds: float) -> None:
    await asyncio.sleep(seconds)


def monotonic() -> float:
    return time.monotonic()


async def resolve(value: Union[T, Awaitable[T]]) -> T:
    """``value``, awaited when it is awaitable (a token provider may be sync or async)."""
    if inspect.isawaitable(value):
        return cast(T, await value)
    return value


async def call(callback: Callable[..., Any], *args: Any) -> None:
    """Calls a user callback, awaiting its result when it returns an awaitable."""
    result = callback(*args)
    if inspect.isawaitable(result):
        await result
