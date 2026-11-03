"""The run() helpers: start once, follow over the socket or by polling, callbacks, failures, timeouts, aborts."""

from __future__ import annotations

import asyncio
import threading
from typing import Any, Iterator, List

import httpx
import pytest
import respx

import maitento
from factories import sample
from fake_notifications import FakeNotifications
from helpers import API_KEY, API_KEY_HEADER, RUN_ID, interaction_run
from maitento import _aio, _sio
from maitento._async import _run as async_run
from maitento._sync import _run as sync_run

START = "/namespaces/demo/interactions/by-name/hello/start"
GET = f"/interactions/processes/by-id/{RUN_ID}"
KILL = f"/processes/Interaction/{RUN_ID}/kill"


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch, sleeps: List[float]) -> List[float]:
    """A fake monotonic clock that the fake sleeps advance."""
    now = [0.0]

    def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)
        now[0] += seconds

    async def fake_async_sleep(seconds: float) -> None:
        sleeps.append(seconds)
        now[0] += seconds
        await asyncio.sleep(0)

    monkeypatch.setattr(_sio, "sleep", fake_sleep)
    monkeypatch.setattr(_aio, "sleep", fake_async_sleep)
    monkeypatch.setattr(_sio, "monotonic", lambda: now[0])
    monkeypatch.setattr(_aio, "monotonic", lambda: now[0])
    return now


def states(*statuses: str, **last: Any) -> List[httpx.Response]:
    bodies = [interaction_run(status, dateUpdated=f"2026-10-26T10:00:{i:02d}Z") for i, status in enumerate(statuses, start=1)]
    bodies[-1].update(last)
    return [httpx.Response(200, json=body) for body in bodies]


# -------------------------------------------------------------------------------------------------------- polling


def test_polling_run_reports_states_and_returns_the_finished_run(
    mock: respx.MockRouter, client: maitento.Maitento, clock: List[float], sleeps: List[float]
) -> None:
    approval = {**sample("PendingToolCallApproval"), "id": "ap1"}
    start = mock.put(START).mock(return_value=httpx.Response(200, json=interaction_run("New", dateUpdated="2026-10-26T10:00:00Z")))
    mock.get(GET).mock(
        side_effect=[
            httpx.Response(200, json=interaction_run("Running", dateUpdated="2026-10-26T10:00:01Z")),
            httpx.Response(200, json=interaction_run("Running", dateUpdated="2026-10-26T10:00:01Z")),
            httpx.Response(200, json=interaction_run("PendingApproval", dateUpdated="2026-10-26T10:00:02Z", pendingApproval=approval)),
            httpx.Response(200, json=interaction_run("PendingApproval", dateUpdated="2026-10-26T10:00:02Z", pendingApproval=approval)),
            httpx.Response(200, json=interaction_run("Finished", dateUpdated="2026-10-26T10:00:03Z", output="Hello Ada")),
        ]
    )
    updates: List[str] = []
    waiting: List[str] = []
    run = client.interactions.run(
        "hello",
        inputs={"name": "Ada"},
        on_update=lambda r: updates.append(str(r.status)),
        on_waiting=lambda r: waiting.append(r.pending_approval.id),
    )
    assert run.output == "Hello Ada" and str(run.status) == "Finished"
    assert updates == ["New", "Running", "PendingApproval", "Finished"]
    assert waiting == ["ap1"]
    assert start.call_count == 1
    assert sleeps[:5] == pytest.approx([1.0, 1.5, 2.25, 3.375, 5.0])


def test_polling_failure_raises_process_failed(mock: respx.MockRouter, client: maitento.Maitento, clock: List[float]) -> None:
    mock.put(START).mock(return_value=httpx.Response(200, json=interaction_run("New")))
    mock.get(GET).mock(
        return_value=httpx.Response(
            200,
            json=interaction_run("Error", failureDetails="No key for DeepSeek [api:model-keys:none-for-provider]"),
        )
    )
    with pytest.raises(maitento.ProcessFailedError) as caught:
        client.interactions.run("hello")
    assert caught.value.status == "Error"
    assert caught.value.failure_details is not None and caught.value.failure_details.endswith("[api:model-keys:none-for-provider]")
    assert caught.value.run.id == RUN_ID
    run = client.interactions.run("hello", throw_on_failure=False)
    assert str(run.status) == "Error"


def test_timeout_does_not_kill_unless_asked(mock: respx.MockRouter, client: maitento.Maitento, clock: List[float]) -> None:
    mock.put(START).mock(return_value=httpx.Response(200, json=interaction_run("New")))
    mock.get(GET).mock(return_value=httpx.Response(200, json=interaction_run("Running")))
    kill = mock.post(KILL).mock(return_value=httpx.Response(204))
    with pytest.raises(maitento.TimeoutError) as caught:
        client.interactions.run("hello", timeout=10)
    assert caught.value.run is not None and kill.call_count == 0
    assert clock[0] == pytest.approx(10, abs=0.1)
    with pytest.raises(TimeoutError):
        client.interactions.run("hello", timeout=3, kill_on_abort=True)
    assert kill.call_count == 1


def test_abort_event(mock: respx.MockRouter, client: maitento.Maitento, clock: List[float]) -> None:
    mock.put(START).mock(return_value=httpx.Response(200, json=interaction_run("New")))
    mock.get(GET).mock(return_value=httpx.Response(200, json=interaction_run("Running")))
    kill = mock.post(KILL).mock(return_value=httpx.Response(204))
    abort = threading.Event()

    def on_update(run: Any) -> None:
        if str(run.status) == "Running":
            abort.set()

    with pytest.raises(maitento.AbortedError):
        client.interactions.run("hello", on_update=on_update, abort=abort, kill_on_abort=True)
    assert kill.call_count == 1


def test_other_run_helpers_poll_their_own_routes(mock: respx.MockRouter, client: maitento.Maitento, clock: List[float]) -> None:
    app = sample("AppProcess", id="p1", status="Finished", returnValue="42")
    mock.put("/namespaces/demo/apps/by-name/triage/versions/latest/start").mock(return_value=httpx.Response(200, json={**app, "status": "New"}))
    mock.get("/apps/processes/by-id/p1").mock(return_value=httpx.Response(200, json=app))
    assert client.apps.run("triage").return_value == "42"

    capsule = sample("CapsuleProcess", id="c1", status="Killed")
    mock.put("/namespaces/demo/capsules/by-name/box/versions/latest/start").mock(return_value=httpx.Response(200, json={**capsule, "status": "New"}))
    mock.get("/capsule-processes/by-id/c1").mock(return_value=httpx.Response(200, json=capsule))
    with pytest.raises(maitento.ProcessFailedError):
        client.capsules.run("box")

    pipeline = sample("CodePipelineProcess", id="cp1", status="Finished")
    mock.put("/namespaces/demo/code-pipelines/by-name/gen/start").mock(return_value=httpx.Response(200, json={**pipeline, "status": "New"}))
    mock.get("/code-pipelines/processes/by-id/cp1").mock(return_value=httpx.Response(200, json=pipeline))
    waiting: List[Any] = []
    assert str(client.pipelines.run("gen", on_waiting=waiting.append).status) == "Finished"


def test_errors_name_the_kind_of_run_its_id_status_and_failure(
    mock: respx.MockRouter, client: maitento.Maitento, clock: List[float]
) -> None:
    """The same text in every SDK: ``<Kind> run <id> ended <Status>: <details>`` (or ``.`` with none)."""
    mock.put(START).mock(return_value=httpx.Response(200, json=interaction_run("New")))
    get = mock.get(GET).mock(return_value=httpx.Response(200, json=interaction_run("Error", failureDetails="The model refused.")))
    with pytest.raises(maitento.ProcessFailedError) as failed:
        client.interactions.run("hello")
    assert str(failed.value) == f"Interaction run {RUN_ID} ended Error: The model refused."

    get.mock(return_value=httpx.Response(200, json=interaction_run("Killed", failureDetails=None)))
    with pytest.raises(maitento.ProcessFailedError) as killed:
        client.interactions.run("hello")
    assert str(killed.value) == f"Interaction run {RUN_ID} ended Killed."

    app = sample("AppProcess", id="p1", status="Error", failureDetails="Tell me which product.")
    mock.put("/namespaces/demo/apps/by-name/triage/versions/latest/start").mock(return_value=httpx.Response(200, json={**app, "status": "New"}))
    mock.get("/apps/processes/by-id/p1").mock(return_value=httpx.Response(200, json=app))
    with pytest.raises(maitento.ProcessFailedError) as app_failed:
        client.apps.run("triage")
    assert str(app_failed.value) == "App run p1 ended Error: Tell me which product."

    pipeline = sample("CodePipelineProcess", id="cp1", status="Error", failureDetails=None, failureReason="AgentTimedOut")
    mock.put("/namespaces/demo/code-pipelines/by-name/gen/start").mock(return_value=httpx.Response(200, json={**pipeline, "status": "New"}))
    mock.get("/code-pipelines/processes/by-id/cp1").mock(return_value=httpx.Response(200, json=pipeline))
    with pytest.raises(maitento.ProcessFailedError) as pipeline_failed:
        client.pipelines.run("gen")
    assert str(pipeline_failed.value) == "Code pipeline run cp1 ended Error: AgentTimedOut"

    get.mock(return_value=httpx.Response(200, json=interaction_run("Running")))
    with pytest.raises(maitento.TimeoutError) as timed_out:
        client.interactions.run("hello", timeout=2)
    assert str(timed_out.value) == f"Interaction run {RUN_ID} did not finish within 2s."


async def test_async_polling_run(mock: respx.MockRouter, aclient: maitento.AsyncMaitento, clock: List[float]) -> None:
    mock.put(START).mock(return_value=httpx.Response(200, json=interaction_run("New")))
    mock.get(GET).mock(side_effect=states("Running", "Finished", output="Hi"))
    updates: List[str] = []

    async def on_update(run: Any) -> None:
        updates.append(str(run.status))

    run = await aclient.interactions.run("hello", on_update=on_update)
    assert run.output == "Hi" and updates == ["New", "Running", "Finished"]


async def test_async_callbacks_are_awaited_once_per_waiting_episode(
    mock: respx.MockRouter, aclient: maitento.AsyncMaitento, clock: List[float]
) -> None:
    def waiting(approval_id: str, second: int) -> httpx.Response:
        approval = {**sample("PendingToolCallApproval"), "id": approval_id}
        return httpx.Response(
            200, json=interaction_run("PendingApproval", dateUpdated=f"2026-10-26T10:00:{second:02d}Z", pendingApproval=approval)
        )

    mock.put(START).mock(return_value=httpx.Response(200, json=interaction_run("New")))
    mock.get(GET).mock(
        side_effect=[
            waiting("ap1", 1),
            waiting("ap1", 2),  # still the same wait: no second call
            *states("Running"),
            waiting("ap2", 4),
            httpx.Response(200, json=interaction_run("Finished", dateUpdated="2026-10-26T10:00:05Z")),
        ]
    )
    seen: List[str] = []

    async def on_waiting(run: Any) -> None:
        await asyncio.sleep(0)
        seen.append(run.pending_approval.id)

    run = await aclient.interactions.run("hello", on_waiting=on_waiting)
    assert str(run.status) == "Finished" and seen == ["ap1", "ap2"]


def test_a_callback_error_stops_following_and_is_raised_as_is(
    mock: respx.MockRouter, client: maitento.Maitento, clock: List[float]
) -> None:
    class Stop(Exception):
        pass

    mock.put(START).mock(return_value=httpx.Response(200, json=interaction_run("New")))
    get = mock.get(GET).mock(return_value=httpx.Response(200, json=interaction_run("Running", dateUpdated="2026-10-26T10:00:01Z")))
    kill = mock.post(KILL).mock(return_value=httpx.Response(204))

    def on_update(run: Any) -> None:
        if str(run.status) == "Running":
            raise Stop()

    with pytest.raises(Stop):
        client.interactions.run("hello", on_update=on_update, kill_on_abort=True)
    assert get.call_count == 1 and kill.call_count == 0


async def test_async_cancellation_kills_when_asked(mock: respx.MockRouter, aclient: maitento.AsyncMaitento) -> None:
    mock.put(START).mock(return_value=httpx.Response(200, json=interaction_run("New")))
    mock.get(GET).mock(return_value=httpx.Response(200, json=interaction_run("Running")))
    kill = mock.post(KILL).mock(return_value=httpx.Response(204))
    task = asyncio.ensure_future(aclient.interactions.run("hello", kill_on_abort=True))
    for _ in range(50):
        await asyncio.sleep(0)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert kill.call_count == 1


# --------------------------------------------------------------------------------------------------------- socket


@pytest.fixture
def server() -> Iterator[FakeNotifications]:
    with FakeNotifications(authorization=API_KEY_HEADER) as fake:
        yield fake


def push_run(server: FakeNotifications) -> None:
    def token(text: str, run_id: str = RUN_ID, kind: str = "Chat") -> Any:
        return {**sample("InteractionStreamUserNotification"), "stream": text, "associatedId": run_id, "agentName": "Greeter", "type": kind}

    server.send("interaction-process-stream", token("Hel"))
    server.send("interaction-process-stream", token("lookup(order=1)", kind="Function"))
    server.send("interaction-process-stream", token("nope", run_id="0e0e0e0e-0000-4000-8000-000000000000"))
    server.send("interaction-process-stream", token("lo Ada"))
    server.send("interaction-process-updated", interaction_run("Running", dateUpdated="2026-10-26T10:00:01Z"))
    server.send("interaction-process-updated", interaction_run("Finished", dateUpdated="2026-10-26T10:00:02Z", output="Hello Ada"))


def test_run_streams_tokens_over_the_socket(server: FakeNotifications) -> None:
    with respx.mock(base_url=server.url, assert_all_called=False) as http:
        http.put(START).mock(side_effect=lambda request: (push_run(server), httpx.Response(200, json=interaction_run("New")))[1])
        get = http.get(GET).mock(return_value=httpx.Response(200, json=interaction_run("Running")))
        tokens: List[str] = []
        updates: List[str] = []
        with maitento.Maitento(API_KEY, base_url=server.url, namespace="demo", environ={}) as mt:
            run = mt.interactions.run(
                "hello",
                on_token=lambda text, agent: tokens.append(f"{agent}:{text}"),
                on_update=lambda r: updates.append(str(r.status)),
                timeout=20,
            )
            assert mt.events._open == []  # the socket it opened for the tokens is closed again
        assert run.output == "Hello Ada"
        assert tokens == ["Greeter:Hel", "Greeter:lo Ada"]
        assert updates == ["New", "Running", "Finished"]
        assert get.call_count == 0  # followed entirely over the socket


def test_run_resyncs_when_the_socket_is_quiet(server: FakeNotifications, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sync_run, "SOCKET_RESYNC", 0.2)
    with respx.mock(base_url=server.url, assert_all_called=False) as http:
        http.put(START).mock(return_value=httpx.Response(200, json=interaction_run("New")))
        get = http.get(GET).mock(return_value=httpx.Response(200, json=interaction_run("Finished", output="ok")))
        with maitento.Maitento(API_KEY, base_url=server.url, namespace="demo", environ={}) as mt:
            stream = mt.events.connect()
            run = mt.interactions.run("hello", timeout=20)
            assert not stream.closed  # a stream the caller opened stays open
        assert run.output == "ok" and get.call_count == 1


async def test_async_run_streams_tokens(server: FakeNotifications, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(async_run, "SOCKET_RESYNC", 30.0)
    with respx.mock(base_url=server.url, assert_all_called=False) as http:
        http.put(START).mock(side_effect=lambda request: (push_run(server), httpx.Response(200, json=interaction_run("New")))[1])
        get = http.get(GET).mock(return_value=httpx.Response(200, json=interaction_run("Running")))
        tokens: List[str] = []
        async with maitento.AsyncMaitento(API_KEY, base_url=server.url, namespace="demo", environ={}) as mt:
            run = await mt.interactions.run("hello", on_token=lambda text, agent: tokens.append(text), timeout=20)
        assert run.output == "Hello Ada" and tokens == ["Hel", "lo Ada"] and get.call_count == 0
