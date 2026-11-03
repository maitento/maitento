"""The I/O-free half of the ``/notifications`` WebSocket client, shared by the blocking and the asyncio streams.

- The server pushes ``{"name", "id", "message"}`` text frames. There is no subscribe protocol: filtering by event name
  and entity id happens here, client-side.
- The client must send something at least every 30 s; the streams send ``ping`` every 15 s.
- Reconnects back off from 1 s to 30 s with +/-20% jitter. Delivery is at-most-once, so after a reconnect the stream
  emits a ``reconnected`` event and callers re-read whatever they show.
"""

from __future__ import annotations

import functools
import json
import logging
import random
from dataclasses import dataclass
from typing import Any, Callable, Dict, FrozenSet, Iterable, List, Literal, Optional, Tuple, Union
from urllib.parse import urlencode, urlsplit, urlunsplit

import pydantic

from ._generated.models import NOTIFICATION_EVENT_PAYLOADS

__all__ = [
    "EVENT_NAMES",
    "Event",
    "EventFilter",
    "PSEUDO_EVENTS",
    "Scope",
    "backoff_delay",
    "notifications_url",
    "parse_frame",
]

logger = logging.getLogger("maitento.events")

Scope = Literal["user", "tenant"]

EVENT_NAMES: Tuple[str, ...] = (
    "setup",
    "interaction-process-updated",
    "interaction-process-stream",
    "app-process-updated",
    "capsule-process-updated",
    "code-pipeline-process-updated",
    "ingested-file-updated",
    "process-updated",
)
"""The server's event names (``ping`` frames are swallowed by the stream)."""

PSEUDO_EVENTS: Tuple[str, ...] = ("reconnected", "disconnected", "error")
"""Events the stream itself raises: after a reconnect, when the socket drops, and when it gives up."""

PING_INTERVAL = 15.0
RECONNECT_BASE = 1.0
RECONNECT_CAP = 30.0
RECONNECT_JITTER = 0.2


def notifications_url(base_url: str, scope: Scope) -> str:
    """``{base}/notifications`` with ``http(s)`` swapped for ``ws(s)``; ``scope=tenant`` only when asked for."""
    parts = urlsplit(base_url.rstrip("/"))
    scheme = {"https": "wss", "http": "ws"}.get(parts.scheme, parts.scheme)
    query = urlencode({"scope": "tenant"}) if scope == "tenant" else ""
    return urlunsplit((scheme, parts.netloc, parts.path + "/notifications", query, ""))


def backoff_delay(attempt: int, rng: Callable[[], float] = random.random, *, base: float = RECONNECT_BASE) -> float:
    """Seconds before reconnect number ``attempt`` (0-based): ``base * 2**attempt`` capped at 30 s, +/-20% jitter."""
    delay = min(RECONNECT_CAP, base * (2.0**attempt))
    return max(0.0, delay * (1 + RECONNECT_JITTER * (2 * rng() - 1)))


class Event:
    """One event from the stream.

    ``name`` is the event name; ``message`` the raw JSON payload; ``data`` the payload parsed into its model
    (``InteractionProcess``, ``InteractionStreamUserNotification``, ...), or the raw payload for an event this SDK
    version does not know; ``id`` the id of the entity it is about (a run id, a file id), when it has one.
    """

    def __init__(self, name: str, message: Any = None, frame_id: Optional[int] = None) -> None:
        self.name = name
        self.message = message
        self.frame_id = frame_id

    @property
    def id(self) -> Optional[str]:
        """The entity the event is about: ``associatedId`` for stream deltas (the run id), else ``id``."""
        if not isinstance(self.message, dict):
            return None
        value = self.message.get("associatedId") if self.name == "interaction-process-stream" else self.message.get("id")
        return value if isinstance(value, str) else None

    @functools.cached_property
    def data(self) -> Any:
        model = NOTIFICATION_EVENT_PAYLOADS.get(self.name)
        if model is None or not isinstance(self.message, dict):
            return self.message
        try:
            return model.model_validate(self.message)
        except pydantic.ValidationError:
            logger.warning("Could not parse a %s event; passing its raw payload through.", self.name)
            return self.message

    def __repr__(self) -> str:
        return f"Event(name={self.name!r}, id={self.id!r})"


def parse_frame(text: Union[str, bytes]) -> Optional[Event]:
    """The event in one frame, or ``None`` for ``ping`` and anything that is not an event."""
    try:
        frame = json.loads(text)
    except ValueError:
        logger.debug("Ignoring a non-JSON frame.")
        return None
    if not isinstance(frame, dict) or not isinstance(frame.get("name"), str):
        return None
    name = frame["name"]
    if name == "ping":
        return None
    frame_id = frame.get("id")
    return Event(name, frame.get("message"), frame_id if isinstance(frame_id, int) else None)


@dataclass(frozen=True)
class EventFilter:
    """Which events a callback or subscription wants: by name (``None`` = all) and entity id (``None`` = any).

    Pseudo events (``reconnected``, ``disconnected``, ``error``) reach a filter only when it names them, or
    when it has no names (an unfiltered listener sees everything).
    """

    names: Optional[FrozenSet[str]] = None
    id: Optional[str] = None

    @classmethod
    def of(cls, names: Union[str, Iterable[str], None], id: Optional[str] = None) -> "EventFilter":
        if names is None or names == "*":
            return cls(None, id)
        if isinstance(names, str):
            return cls(frozenset({names}), id)
        return cls(frozenset(names), id)

    def matches(self, event: Event) -> bool:
        if self.names is not None and event.name not in self.names:
            return False
        if self.id is not None and event.name not in PSEUDO_EVENTS:
            return event.id is not None and event.id.lower() == self.id.lower()
        return True


Callback = Callable[[Event], Any]


class Listeners:
    """The ``on(...)`` callbacks of a stream. Thread-safe enough for one reader adding/removing under the GIL."""

    def __init__(self) -> None:
        self._items: List[Tuple[EventFilter, Callback]] = []

    def add(self, event_filter: EventFilter, callback: Callback) -> Callable[[], None]:
        entry = (event_filter, callback)
        self._items.append(entry)

        def remove() -> None:
            try:
                self._items.remove(entry)
            except ValueError:
                pass

        return remove

    def remove_callback(self, callback: Callback) -> None:
        self._items = [entry for entry in self._items if entry[1] is not callback]

    def matching(self, event: Event) -> List[Callback]:
        return [callback for event_filter, callback in list(self._items) if event_filter.matches(event)]


def authorization_headers(authorization: str) -> Dict[str, str]:
    return {"Authorization": authorization}
