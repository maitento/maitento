"""Live events for :class:`Maitento` over the ``/notifications`` WebSocket (blocking, one reader thread).

Hand-written (not generated): the asyncio twin is ``maitento/_async/_events.py``. Both share
``maitento/_events_core.py``, which holds the protocol rules.
"""

from __future__ import annotations

import builtins
import logging
import queue
import random
import threading
import time
from typing import TYPE_CHECKING, Any, Callable, Iterable, Iterator, List, Optional, Union

from websockets.exceptions import ConnectionClosed, InvalidHandshake, InvalidStatus
from websockets.sync.client import ClientConnection, connect

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
    from ._client import Maitento

__all__ = ["EventStream", "Events", "Subscription"]

logger = logging.getLogger("maitento.events")


class _End:
    def __init__(self, error: Optional[BaseException]) -> None:
        self.error = error


class Subscription:
    """A thread-safe queue of the events matching one filter. Iterate it, or call ``get(timeout)``. ``close()``
    when done."""

    def __init__(self, stream: "EventStream", event_filter: EventFilter) -> None:
        self._stream = stream
        self.filter = event_filter
        self._queue: "queue.Queue[Union[Event, _End]]" = queue.Queue()
        self._end: Optional[_End] = None

    @property
    def closed(self) -> bool:
        return self._end is not None and self._queue.qsize() <= 1  # only the end marker (or nothing) is left

    def _push(self, event: Event) -> None:
        if self._end is None:
            self._queue.put(event)

    def _finish(self, error: Optional[BaseException]) -> None:
        if self._end is None:
            self._end = _End(error)
            self._queue.put(self._end)

    def get(self, timeout: Optional[float] = None) -> Optional[Event]:
        """The next event, or ``None`` after ``timeout`` seconds or once the subscription has ended."""
        if self.closed:
            return None
        try:
            item = self._queue.get(timeout=timeout)
        except queue.Empty:
            return None
        return item if isinstance(item, Event) else None

    def close(self) -> None:
        self._stream._remove(self)
        self._finish(None)

    def __iter__(self) -> Iterator[Event]:
        return self

    def __next__(self) -> Event:
        if self._end is not None and self._queue.empty():
            raise StopIteration
        item = self._queue.get()
        if isinstance(item, _End):
            if item.error is not None:
                raise item.error
            raise StopIteration
        return item


class EventStream:
    """An open ``/notifications`` socket, read by a background thread.

    - ``on(name, callback, id=...)`` registers a callback (``name`` may be ``"*"``, an event name, or ``reconnected``
      / ``disconnected`` / ``error``); it returns a function that removes it. Callbacks run on the reader thread.
    - ``for event in stream`` iterates every event from the moment iteration starts.
    - ``subscribe(names, id=...)`` gives a separately-buffered, filtered queue.
    - ``close()`` ends it (also ``with``).

    It pings every 15 s and reconnects with backoff (1 s to 30 s, +/-20% jitter) using a fresh credential, then
    emits ``reconnected``: delivery is at-most-once, so re-read whatever you display.
    """

    def __init__(
        self,
        client: "Maitento",
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
        self._subscriptions: List[Subscription] = []
        self._lock = threading.Lock()
        self._ws: Optional[ClientConnection] = None
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._rng = random.random
        self.reconnects = 0
        """How many times the stream has reconnected."""

    @property
    def closed(self) -> bool:
        return self._stop.is_set()

    # -------------------------------------------------------------------------------------------------- consumers

    def on(self, name: Union[str, Iterable[str]], callback: Callable[[Event], Any], *, id: Optional[str] = None) -> Callable[[], None]:
        """Calls ``callback(event)`` for each matching event; returns a function that unregisters it."""
        return self._listeners.add(EventFilter.of(name, id), callback)

    def off(self, callback: Callable[[Event], Any]) -> None:
        """Unregisters every registration of ``callback``."""
        self._listeners.remove_callback(callback)

    def subscribe(self, names: Union[str, Iterable[str], None] = None, *, id: Optional[str] = None) -> Subscription:
        """A buffered queue of the events matching ``names`` (``None``/``"*"``: all) and entity ``id``."""
        subscription = Subscription(self, EventFilter.of(names, id))
        with self._lock:
            if self.closed:
                subscription._finish(None)
            else:
                self._subscriptions.append(subscription)
        return subscription

    def __iter__(self) -> Iterator[Event]:
        return self.subscribe().__iter__()

    def __enter__(self) -> "EventStream":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    def _remove(self, subscription: Subscription) -> None:
        with self._lock:
            try:
                self._subscriptions.remove(subscription)
            except ValueError:
                pass

    # ------------------------------------------------------------------------------------------------- connection

    def _connect_once(self) -> ClientConnection:
        headers = {"Authorization": self._client._transport.authorization()}
        try:
            ws = connect(
                self.url,
                additional_headers=headers,
                user_agent_header=self._client._transport.user_agent,
                open_timeout=self._open_timeout,
                max_size=None,  # a full interaction run can be megabytes
                close_timeout=5,
            )
            # websockets >= 17.1 warns on first use of a connection that was not entered as a context manager
            # (`legacy=True` silences it too, but older versions reject that argument). Entering it is a no-op
            # otherwise: the stream closes it itself.
            ws.__enter__()
            return ws
        except InvalidStatus as error:
            response = error.response
            raise error_for(
                response.status_code,
                dict(response.headers.raw_items()),
                bytes(response.body or b""),
                method="GET",
                url=self.url.split("?")[0],
            ) from error
        except (OSError, builtins.TimeoutError, InvalidHandshake) as error:
            raise ConnectionError(f"Could not open the event socket {self.url.split('?')[0]}: {error}") from error

    def _start(self) -> None:
        self._ws = self._connect_once()
        self._thread = threading.Thread(target=self._run, name="maitento-events", daemon=True)
        self._thread.start()

    def _run(self) -> None:
        attempt = 0
        while not self.closed:
            ws = self._ws
            if ws is None:
                break
            self._read(ws)
            if self.closed:
                break
            self._emit(Event("disconnected"))
            self._ws = None
            while not self.closed:
                if self._stop.wait(backoff_delay(attempt, self._rng, base=self._reconnect_base)):
                    break
                attempt += 1
                try:
                    self._ws = self._connect_once()
                except (AuthenticationError, PermissionError) as error:
                    self._fail(error)
                    return
                except (MaitentoError, OSError) as error:
                    logger.info("Event socket reconnect %d failed: %s", attempt, error)
                    continue
                break
            if self.closed:
                if self._ws is not None:
                    self._ws.close()
                break
            attempt = 0
            self.reconnects += 1
            self._emit(Event("reconnected"))

    def _read(self, ws: ClientConnection) -> None:
        next_ping = time.monotonic() + self._ping_interval
        try:
            while not self.closed:
                now = time.monotonic()
                if now >= next_ping:
                    ws.send("ping")
                    next_ping = now + self._ping_interval
                try:
                    message = ws.recv(timeout=max(next_ping - now, 0.0))
                except builtins.TimeoutError:
                    continue
                event = parse_frame(message)
                if event is not None:
                    self._emit(event)
        except ConnectionClosed:
            pass
        except Exception:  # never let the reader die silently
            logger.exception("The event stream reader failed; reconnecting.")

    # --------------------------------------------------------------------------------------------------- dispatch

    def _emit(self, event: Event) -> None:
        with self._lock:
            subscriptions = list(self._subscriptions)
        for subscription in subscriptions:
            if subscription.filter.matches(event):
                subscription._push(event)
        for callback in self._listeners.matching(event):
            try:
                callback(event)
            except Exception:
                logger.exception("An event callback raised; the stream continues.")

    def _fail(self, error: BaseException) -> None:
        self._stop.set()
        self._emit(Event("error", {"error": str(error)}))
        with self._lock:
            subscriptions, self._subscriptions = self._subscriptions, []
        for subscription in subscriptions:
            subscription._finish(error)
        self._client.events._forget(self)

    def close(self) -> None:
        """Closes the socket and ends every subscription and iteration."""
        self._stop.set()
        ws, self._ws = self._ws, None
        if ws is not None:
            ws.close()
        thread, self._thread = self._thread, None
        if thread is not None and thread is not threading.current_thread():
            thread.join(timeout=10)
        with self._lock:
            subscriptions, self._subscriptions = self._subscriptions, []
        for subscription in subscriptions:
            subscription._finish(None)
        self._client.events._forget(self)


class Events:
    """``client.events``: opens live-event streams."""

    def __init__(self, client: "Maitento") -> None:
        self._client = client
        self._open: List[EventStream] = []

    def connect(self, scope: Scope = "user", *, ping_interval: float = PING_INTERVAL) -> EventStream:
        """Opens the ``/notifications`` socket.

        ``scope="user"`` (the default) carries the full state of the caller's own runs and the token stream;
        ``scope="tenant"`` carries a ``process-updated`` summary of every run in the tenant instead.
        While a stream is open, the ``run()`` helpers follow runs over it instead of polling.
        """
        if scope not in ("user", "tenant"):
            raise ValueError("scope must be 'user' or 'tenant'")
        stream = EventStream(self._client, scope, ping_interval=ping_interval)
        stream._start()
        self._open.append(stream)
        return stream

    def _stream_for_runs(self) -> Optional[EventStream]:
        open_streams = [stream for stream in self._open if not stream.closed]
        for stream in open_streams:
            if stream.scope == "user":
                return stream
        return open_streams[0] if open_streams else None

    def _forget(self, stream: EventStream) -> None:
        try:
            self._open.remove(stream)
        except ValueError:
            pass

    def close_all(self) -> None:
        for stream in list(self._open):
            stream.close()
