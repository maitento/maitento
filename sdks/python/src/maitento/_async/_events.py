"""Live events for :class:`AsyncMaitento` over the ``/notifications`` WebSocket (asyncio).

Hand-written (not generated): the blocking twin is ``maitento/_sync/_events.py``. Both share
``maitento/_events_core.py``, which holds the protocol rules.
"""

from __future__ import annotations

import asyncio
import logging
import random
from typing import TYPE_CHECKING, Any, AsyncIterator, Callable, Iterable, List, Optional, Tuple, Union

from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed, InvalidHandshake, InvalidStatus

from .. import _aio
from .._events_core import (
    PING_INTERVAL,
    RECONNECT_BASE,
    Event,
    EventFilter,
    Listeners,
    Scope,
    backoff_delay,
    notifications_url,
    parse_frame,
)
from .._http import error_for
from ..errors import AuthenticationError, ConnectionError, MaitentoError, PermissionError

if TYPE_CHECKING:
    from ._client import AsyncMaitento

__all__ = ["AsyncEventStream", "AsyncEvents", "AsyncSubscription"]

logger = logging.getLogger("maitento.events")


class _End:
    def __init__(self, error: Optional[BaseException]) -> None:
        self.error = error


class AsyncSubscription:
    """A queue of the events matching one filter. Iterate it, or ``await get(timeout)``. ``close()`` when done."""

    def __init__(self, stream: "AsyncEventStream", event_filter: EventFilter) -> None:
        self._stream = stream
        self.filter = event_filter
        self._queue: "asyncio.Queue[Union[Event, _End]]" = asyncio.Queue()
        self._end: Optional[_End] = None

    @property
    def closed(self) -> bool:
        return self._end is not None and self._queue.qsize() <= 1  # only the end marker (or nothing) is left

    def _push(self, event: Event) -> None:
        if self._end is None:
            self._queue.put_nowait(event)

    def _finish(self, error: Optional[BaseException]) -> None:
        if self._end is None:
            self._end = _End(error)
            self._queue.put_nowait(self._end)

    async def get(self, timeout: Optional[float] = None) -> Optional[Event]:
        """The next event, or ``None`` after ``timeout`` seconds or once the subscription has ended."""
        if self.closed:
            return None
        try:
            item = await asyncio.wait_for(self._queue.get(), timeout)
        except asyncio.TimeoutError:
            return None
        return item if isinstance(item, Event) else None

    def close(self) -> None:
        self._stream._remove(self)
        self._finish(None)

    def __aiter__(self) -> AsyncIterator[Event]:
        return self

    async def __anext__(self) -> Event:
        if self._end is not None and self._queue.empty():
            raise StopAsyncIteration
        item = await self._queue.get()
        if isinstance(item, _End):
            if item.error is not None:
                raise item.error
            raise StopAsyncIteration
        return item


class AsyncEventStream:
    """An open ``/notifications`` socket.

    - ``on(name, callback, id=...)`` registers a callback (``name`` may be ``"*"``, an event name, or ``reconnected``
      / ``disconnected`` / ``error``); it returns a function that removes it. Callbacks may be sync or async.
    - ``async for event in stream`` iterates every event from the moment iteration starts.
    - ``subscribe(names, id=...)`` gives a separately-buffered, filtered queue.
    - ``close()`` ends it (also ``async with``).

    It pings every 15 s and reconnects with backoff (1 s to 30 s, +/-20% jitter) using a fresh credential, then
    emits ``reconnected``: delivery is at-most-once, so re-read whatever you display.
    """

    def __init__(
        self,
        client: "AsyncMaitento",
        scope: Scope,
        *,
        ping_interval: float = PING_INTERVAL,
        reconnect_base: float = RECONNECT_BASE,
        open_timeout: float = 10.0,
    ) -> None:
        self._client = client
        self.scope: Scope = scope
        self.url = notifications_url(client._transport.base_url, scope)
        self._ping_interval = ping_interval
        self._reconnect_base = reconnect_base
        self._open_timeout = open_timeout
        self._listeners = Listeners()
        self._subscriptions: List[AsyncSubscription] = []
        self._ws: Optional[ClientConnection] = None
        self._task: Optional["asyncio.Task[None]"] = None
        self._closed = False
        self._rng = random.random
        self._pending: List[Tuple[Callable[[Event], Any], Event]] = []
        self.reconnects = 0
        """How many times the stream has reconnected."""

    @property
    def closed(self) -> bool:
        return self._closed

    # -------------------------------------------------------------------------------------------------- consumers

    def on(self, name: Union[str, Iterable[str]], callback: Callable[[Event], Any], *, id: Optional[str] = None) -> Callable[[], None]:
        """Calls ``callback(event)`` for each matching event; returns a function that unregisters it."""
        return self._listeners.add(EventFilter.of(name, id), callback)

    def off(self, callback: Callable[[Event], Any]) -> None:
        """Unregisters every registration of ``callback``."""
        self._listeners.remove_callback(callback)

    def subscribe(self, names: Union[str, Iterable[str], None] = None, *, id: Optional[str] = None) -> AsyncSubscription:
        """A buffered queue of the events matching ``names`` (``None``/``"*"``: all) and entity ``id``."""
        subscription = AsyncSubscription(self, EventFilter.of(names, id))
        if self._closed:
            subscription._finish(None)
        else:
            self._subscriptions.append(subscription)
        return subscription

    def __aiter__(self) -> AsyncIterator[Event]:
        return self.subscribe().__aiter__()

    async def __aenter__(self) -> "AsyncEventStream":
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.close()

    def _remove(self, subscription: AsyncSubscription) -> None:
        try:
            self._subscriptions.remove(subscription)
        except ValueError:
            pass

    # ------------------------------------------------------------------------------------------------- connection

    async def _connect_once(self) -> ClientConnection:
        headers = {"Authorization": await self._client._transport.authorization()}
        try:
            return await connect(
                self.url,
                additional_headers=headers,
                user_agent_header=self._client._transport.user_agent,
                open_timeout=self._open_timeout,
                max_size=None,
                ping_interval=20,
                ping_timeout=20,
                close_timeout=5,
            )
        except InvalidStatus as error:
            response = error.response
            raise error_for(
                response.status_code,
                dict(response.headers.raw_items()),
                bytes(response.body or b""),
                method="GET",
                url=self.url.split("?")[0],
            ) from error
        except (OSError, asyncio.TimeoutError, InvalidHandshake) as error:
            raise ConnectionError(f"Could not open the event socket {self.url.split('?')[0]}: {error}") from error

    async def _start(self) -> None:
        self._ws = await self._connect_once()
        self._task = asyncio.get_running_loop().create_task(self._run(), name="maitento-events")

    async def _run(self) -> None:
        attempt = 0
        while not self._closed:
            ws = self._ws
            if ws is None:
                break
            pinger = asyncio.get_running_loop().create_task(self._ping(ws))
            try:
                async for message in ws:
                    self._handle(message)
                    await self._flush_callbacks()
            except ConnectionClosed:
                pass
            except Exception:  # never let the reader die silently
                logger.exception("The event stream reader failed; reconnecting.")
            finally:
                pinger.cancel()
            if self._closed:
                break
            self._emit(Event("disconnected"))
            await self._flush_callbacks()
            self._ws = None
            while not self._closed:
                await _aio.sleep(backoff_delay(attempt, self._rng, base=self._reconnect_base))
                attempt += 1
                try:
                    self._ws = await self._connect_once()
                except (AuthenticationError, PermissionError) as error:
                    self._fail(error)
                    await self._flush_callbacks()
                    return
                except (MaitentoError, OSError) as error:
                    logger.info("Event socket reconnect %d failed: %s", attempt, error)
                    continue
                break
            if self._closed:
                if self._ws is not None:
                    await self._ws.close()
                break
            attempt = 0
            self.reconnects += 1
            self._emit(Event("reconnected"))
            await self._flush_callbacks()

    async def _ping(self, ws: ClientConnection) -> None:
        try:
            while True:
                await asyncio.sleep(self._ping_interval)
                await ws.send("ping")
        except (ConnectionClosed, asyncio.CancelledError):
            return

    # --------------------------------------------------------------------------------------------------- dispatch

    def _handle(self, message: Union[str, bytes]) -> None:
        event = parse_frame(message)
        if event is not None:
            self._emit(event)

    def _emit(self, event: Event) -> None:
        for subscription in list(self._subscriptions):
            if subscription.filter.matches(event):
                subscription._push(event)
        self._pending.extend((callback, event) for callback in self._listeners.matching(event))

    async def _flush_callbacks(self) -> None:
        pending, self._pending = self._pending, []
        for callback, event in pending:
            try:
                await _aio.call(callback, event)
            except Exception:
                logger.exception("An event callback raised; the stream continues.")

    def _fail(self, error: BaseException) -> None:
        self._closed = True
        self._emit(Event("error", {"error": str(error)}))
        for subscription in list(self._subscriptions):
            subscription._finish(error)
        self._subscriptions.clear()
        self._client.events._forget(self)

    async def close(self) -> None:
        """Closes the socket and ends every subscription and iteration."""
        if self._closed and self._task is None:
            return
        self._closed = True
        ws, self._ws = self._ws, None
        if ws is not None:
            await ws.close()
        task, self._task = self._task, None
        if task is not None and task is not asyncio.current_task():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        for subscription in list(self._subscriptions):
            subscription._finish(None)
        self._subscriptions.clear()
        self._client.events._forget(self)


class AsyncEvents:
    """``client.events``: opens live-event streams."""

    def __init__(self, client: "AsyncMaitento") -> None:
        self._client = client
        self._open: List[AsyncEventStream] = []

    async def connect(self, scope: Scope = "user", *, ping_interval: float = PING_INTERVAL) -> AsyncEventStream:
        """Opens the ``/notifications`` socket.

        ``scope="user"`` (the default) carries the full state of the caller's own runs and the token stream;
        ``scope="tenant"`` carries a ``process-updated`` summary of every run in the tenant instead.
        While a stream is open, the ``run()`` helpers follow runs over it instead of polling.
        """
        if scope not in ("user", "tenant"):
            raise ValueError("scope must be 'user' or 'tenant'")
        stream = AsyncEventStream(self._client, scope, ping_interval=ping_interval)
        await stream._start()
        self._open.append(stream)
        return stream

    def _stream_for_runs(self) -> Optional[AsyncEventStream]:
        open_streams = [stream for stream in self._open if not stream.closed]
        for stream in open_streams:
            if stream.scope == "user":
                return stream
        return open_streams[0] if open_streams else None

    def _forget(self, stream: AsyncEventStream) -> None:
        try:
            self._open.remove(stream)
        except ValueError:
            pass

    async def close_all(self) -> None:
        for stream in list(self._open):
            await stream.close()

