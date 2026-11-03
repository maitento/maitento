"""Blocking twins of :mod:`maitento._aio`, used by the generated ``maitento/_sync`` code.

Every name here mirrors one in ``_aio`` (see that module): ``scripts/unasync.py`` rewrites ``_aio`` to ``_sio``.
"""

from __future__ import annotations

import inspect
import threading
import time
from typing import Any, Awaitable, Callable, TypeVar, Union

T = TypeVar("T")

Lock = threading.Lock
"""The lock guarding a client's JWT renewal."""

Event = threading.Event
"""The type of the ``abort`` signal a ``run()`` helper accepts."""

CancelledError = KeyboardInterrupt
"""What interrupting a blocking ``run()`` helper raises inside it (``kill_on_abort`` kills the run on it)."""


def sleep(seconds: float) -> None:
    time.sleep(seconds)


def monotonic() -> float:
    return time.monotonic()


def resolve(value: Union[T, Awaitable[T]]) -> T:
    """``value`` itself: a blocking client cannot wait for an awaitable."""
    if inspect.isawaitable(value):
        if inspect.iscoroutine(value):
            value.close()
        raise TypeError("This callback returned an awaitable; use AsyncMaitento for async callbacks.")
    return value


def call(callback: Callable[..., Any], *args: Any) -> None:
    """Calls a user callback."""
    result = callback(*args)
    if inspect.isawaitable(result):
        if inspect.iscoroutine(result):
            result.close()
        raise TypeError("This callback returned an awaitable; use AsyncMaitento for async callbacks.")
