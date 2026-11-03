"""Live events against a fake /notifications server: auth, filtering, callbacks, pings, reconnects (both clients)."""

from __future__ import annotations

import asyncio
import time
from typing import Any, Callable, Iterator, List

import pytest

import maitento
from factories import sample
from fake_notifications import FakeNotifications
from helpers import API_KEY, API_KEY_HEADER, RUN_ID
from maitento._events_core import EventFilter, backoff_delay, notifications_url, parse_frame

OTHER_RUN = "0e0e0e0e-0000-4000-8000-000000000000"


@pytest.fixture
def server() -> Iterator[FakeNotifications]:
    with FakeNotifications(authorization=API_KEY_HEADER) as fake:
        yield fake


def stream_frame(text: str, run_id: str = RUN_ID, kind: str = "Chat") -> Any:
    return {**sample("InteractionStreamUserNotification"), "stream": text, "associatedId": run_id, "agentName": "Greeter", "type": kind}


async def eventually(predicate: Callable[[], bool], timeout: float = 5.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        await asyncio.sleep(0.01)
    return False


# ----------------------------------------------------------------------------------------------------------- core


def test_notifications_url() -> None:
    assert notifications_url("https://api.maitento.com", "user") == "wss://api.maitento.com/notifications"
    assert notifications_url("http://127.0.0.1:4201/", "tenant") == "ws://127.0.0.1:4201/notifications?scope=tenant"
    assert notifications_url("https://app.maitento.com/api", "user") == "wss://app.maitento.com/api/notifications"


def test_backoff_is_exponential_capped_with_jitter() -> None:
    assert backoff_delay(0, lambda: 0.5) == pytest.approx(1.0)
    assert backoff_delay(3, lambda: 0.5) == pytest.approx(8.0)
    assert backoff_delay(10, lambda: 0.5) == pytest.approx(30.0)
    assert backoff_delay(0, lambda: 1.0) == pytest.approx(1.2)
    assert backoff_delay(10, lambda: 0.0) == pytest.approx(24.0)


def test_frames_and_filters() -> None:
    assert parse_frame('{"name": "ping", "id": 3, "message": {}}') is None
    assert parse_frame("not json") is None
    event = parse_frame('{"name": "interaction-process-stream", "id": 9, "message": {"associatedId": "R1", "stream": "x"}}')
    assert event is not None and event.id == "R1" and event.frame_id == 9
    assert EventFilter.of("interaction-process-stream", id="r1").matches(event)  # ids compare case-insensitively
    assert not EventFilter.of("app-process-updated").matches(event)
    assert EventFilter.of(None).matches(event)
    reconnected = maitento.Event("reconnected")
    assert EventFilter.of(None, id="r1").matches(reconnected)
    assert not EventFilter.of("interaction-process-stream").matches(reconnected)


def test_event_data_is_parsed_lazily_and_tolerates_bad_payloads() -> None:
    event = maitento.Event("interaction-process-stream", stream_frame("Hi"))
    assert isinstance(event.data, maitento.InteractionStreamUserNotification) and event.data.stream == "Hi"
    broken = maitento.Event("interaction-process-updated", {"id": "x"})
    assert broken.data == {"id": "x"}
    unknown = maitento.Event("brand-new-event", {"id": "y"})
    assert unknown.data == {"id": "y"} and unknown.id == "y"


# ----------------------------------------------------------------------------------------------------------- sync


def connect(server: FakeNotifications, **kwargs: Any) -> maitento.Maitento:
    return maitento.Maitento(API_KEY, base_url=server.url, environ={}, **kwargs)


def test_sync_stream_filters_and_calls_back(server: FakeNotifications) -> None:
    with connect(server) as mt:
        stream = mt.events.connect()
        seen: List[str] = []
        off = stream.on("interaction-process-stream", lambda e: seen.append(e.data.stream), id=RUN_ID)
        everything = stream.subscribe(["interaction-process-stream", "app-process-updated"])
        server.send("interaction-process-stream", stream_frame("Hel"))
        server.send("interaction-process-stream", stream_frame("other", OTHER_RUN))
        server.send("app-process-updated", {"id": OTHER_RUN})
        server.send("interaction-process-stream", stream_frame("lo"))
        assert server.wait_for(lambda: len(seen) == 2)
        assert seen == ["Hel", "lo"]
        names = [everything.get(5).name for _ in range(4)]  # type: ignore[union-attr]
        assert names == ["interaction-process-stream", "interaction-process-stream", "app-process-updated", "interaction-process-stream"]
        off()
        server.send("interaction-process-stream", stream_frame("!"))
        assert everything.get(5) is not None
        assert seen == ["Hel", "lo"]
        stream.close()
        assert everything.get(0.1) is None and everything.closed
    path, auth, agent = server.requests[0]
    assert path == "/notifications" and auth == API_KEY_HEADER and agent is not None and agent.startswith("maitento-python/")


def test_sync_iteration_ends_on_close(server: FakeNotifications) -> None:
    with connect(server) as mt:
        stream = mt.events.connect()
        received: List[str] = []

        def consume() -> None:
            for event in stream:
                received.append(event.name)

        import threading

        worker = threading.Thread(target=consume)
        worker.start()
        time.sleep(0.2)
        server.send("ingested-file-updated", {"id": "f1"})
        assert server.wait_for(lambda: "ingested-file-updated" in received)
        stream.close()
        worker.join(5)
        assert not worker.is_alive()


def test_sync_pings(server: FakeNotifications) -> None:
    with connect(server) as mt:
        mt.events.connect(ping_interval=0.1)
        assert server.wait_for(lambda: server.received.count("ping") >= 2)


def test_sync_reconnects_and_emits_reconnected(server: FakeNotifications) -> None:
    with connect(server) as mt:
        stream = mt.events.connect()
        stream._reconnect_base = 0.05
        lifecycle: List[str] = []
        stream.on(["disconnected", "reconnected"], lambda e: lifecycle.append(e.name))
        assert server.wait_for(lambda: server.accepted == 1)
        server.drop_all()
        assert server.wait_for(lambda: lifecycle == ["disconnected", "reconnected"])
        assert stream.reconnects == 1 and server.accepted == 2
        sub = stream.subscribe("app-process-updated")
        server.send("app-process-updated", {"id": "a1"})
        event = sub.get(5)
        assert event is not None and event.id == "a1"
        assert server.requests[1][1] == API_KEY_HEADER  # a fresh credential on every attempt


def test_sync_auth_failure_raises() -> None:
    with FakeNotifications(authorization="ApiKey someone else") as server:
        with connect(server) as mt:
            with pytest.raises(maitento.AuthenticationError):
                mt.events.connect()


def test_sync_connection_refused_raises_connection_error() -> None:
    with maitento.Maitento(API_KEY, base_url="http://127.0.0.1:9", environ={}) as mt:
        with pytest.raises(maitento.ConnectionError):
            mt.events.connect()


def test_tenant_scope(server: FakeNotifications) -> None:
    with connect(server) as mt:
        stream = mt.events.connect(scope="tenant")
        assert stream.scope == "tenant"
        with pytest.raises(ValueError):
            mt.events.connect(scope="everyone")  # type: ignore[arg-type]
    assert server.requests[0][0] == "/notifications?scope=tenant"


def test_client_close_closes_streams(server: FakeNotifications) -> None:
    mt = connect(server)
    stream = mt.events.connect()
    mt.close()
    assert stream.closed and mt.events._open == []


# ---------------------------------------------------------------------------------------------------------- async


async def test_async_stream_filters_and_iterates(server: FakeNotifications) -> None:
    async with maitento.AsyncMaitento(API_KEY, base_url=server.url, environ={}) as mt:
        stream = await mt.events.connect()
        seen: List[str] = []

        async def on_token(event: maitento.Event) -> None:
            seen.append(event.data.stream)

        stream.on("interaction-process-stream", on_token, id=RUN_ID)
        sub = stream.subscribe(["interaction-process-stream"], id=RUN_ID)
        server.send("interaction-process-stream", stream_frame("Hel"))
        server.send("interaction-process-stream", stream_frame("x", OTHER_RUN))
        server.send("interaction-process-stream", stream_frame("lo"))
        texts = []
        async for event in sub:
            texts.append(event.data.stream)
            if len(texts) == 2:
                break
        assert texts == ["Hel", "lo"]
        assert await eventually(lambda: seen == ["Hel", "lo"])
        assert await sub.get(0.05) is None
        await stream.close()
        assert sub.closed


async def test_async_pings_and_reconnect(server: FakeNotifications) -> None:
    async with maitento.AsyncMaitento(API_KEY, base_url=server.url, environ={}) as mt:
        stream = await mt.events.connect(ping_interval=0.1)
        stream._reconnect_base = 0.05
        assert await eventually(lambda: server.received.count("ping") >= 2)
        lifecycle = stream.subscribe(["disconnected", "reconnected"])
        await asyncio.to_thread(server.drop_all)
        first = await lifecycle.get(5)
        second = await lifecycle.get(5)
        assert (first and first.name, second and second.name) == ("disconnected", "reconnected")
        assert stream.reconnects == 1


async def test_async_auth_failure_raises() -> None:
    with FakeNotifications(authorization="ApiKey someone else") as server:
        async with maitento.AsyncMaitento(API_KEY, base_url=server.url, environ={}) as mt:
            with pytest.raises(maitento.AuthenticationError):
                await mt.events.connect()


async def test_async_reconnect_auth_failure_ends_the_stream() -> None:
    with FakeNotifications(authorization=API_KEY_HEADER) as server:
        async with maitento.AsyncMaitento(API_KEY, base_url=server.url, environ={}) as mt:
            stream = await mt.events.connect()
            stream._reconnect_base = 0.05
            sub = stream.subscribe()
            errors: List[str] = []
            stream.on("error", lambda e: errors.append(e.message["error"]))
            server.authorization = "ApiKey revoked"
            await asyncio.to_thread(server.drop_all)
            with pytest.raises(maitento.AuthenticationError):
                async for _ in sub:
                    pass
            assert stream.closed and errors
