"""capsule_runs.exec_and_wait: queue a command once, wait for it over the socket or by polling the one command."""

from __future__ import annotations

import asyncio
import json
import threading
from typing import Any, Dict, Iterator, List

import httpx
import pytest
import respx

import maitento
from factories import sample
from fake_notifications import FakeNotifications
from helpers import API_KEY, API_KEY_HEADER, RUN_ID
from maitento import _aio, _sio
from maitento._async import _run as async_run
from maitento._sync import _run as sync_run

COMMAND_ID = "d4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f70"
COMMANDS = f"/capsule-processes/by-id/{RUN_ID}/commands"
ONE_COMMAND = f"{COMMANDS}/{COMMAND_ID}"


def command(status: str = "Pending", **overrides: Any) -> Dict[str, Any]:
    body = sample(
        "CapsuleProcessCommand",
        id=COMMAND_ID,
        operationType="Command",
        command="python3",
        arguments=["--version"],
        status=status,
        exitCode=None,
        outputStandard=None,
        outputError=None,
        failureDetails=None,
    )
    body.update(overrides)
    return body


def capsule_run(status: str, command_body: Dict[str, Any], run_id: str = RUN_ID) -> Dict[str, Any]:
    return sample("CapsuleProcess", id=run_id, status=status, commands=[command_body])


def reads(*bodies: Dict[str, Any]) -> List[httpx.Response]:
    return [httpx.Response(200, json=body) for body in bodies]


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


# -------------------------------------------------------------------------------------------------------- polling


def test_queues_once_and_polls_the_one_command_until_it_finishes(
    mock: respx.MockRouter, client: maitento.Maitento, clock: List[float], sleeps: List[float]
) -> None:
    queue = mock.post(COMMANDS).mock(return_value=httpx.Response(200, json=command()))
    read = mock.get(ONE_COMMAND).mock(
        side_effect=reads(
            command("Pending"),
            command("Running"),
            command("Finished", exitCode=0, outputStandard="Python 3.11.2\n"),
        )
    )
    whole_run = mock.get(f"/capsule-processes/by-id/{RUN_ID}").mock(return_value=httpx.Response(500))

    result = client.capsule_runs.exec_and_wait(RUN_ID, "python3", ["--version"])

    assert str(result.status) == "Finished"
    assert result.exit_code == 0
    assert result.output_standard == "Python 3.11.2\n"
    assert queue.call_count == 1
    assert json.loads(queue.calls[0].request.content) == {"command": "python3", "arguments": ["--version"]}
    assert read.call_count == 3
    assert whole_run.call_count == 0
    assert sleeps == pytest.approx([0.25, 0.375, 0.5625])


def test_the_polling_interval_stops_growing_at_two_seconds(
    mock: respx.MockRouter, client: maitento.Maitento, clock: List[float], sleeps: List[float]
) -> None:
    mock.post(COMMANDS).mock(return_value=httpx.Response(200, json=command()))
    mock.get(ONE_COMMAND).mock(side_effect=reads(*[command("Running")] * 10, command("Finished", exitCode=0)))

    client.capsule_runs.exec_and_wait(RUN_ID, "sleep", ["10"])

    assert max(sleeps) == pytest.approx(2.0)
    assert sleeps[-1] == pytest.approx(2.0)


def test_a_non_zero_exit_code_is_a_result(mock: respx.MockRouter, client: maitento.Maitento, clock: List[float]) -> None:
    mock.post(COMMANDS).mock(return_value=httpx.Response(200, json=command()))
    mock.get(ONE_COMMAND).mock(
        return_value=httpx.Response(
            200, json=command("Error", exitCode=127, outputError="-bash: line 1: sqlite3: command not found\n")
        )
    )

    result = client.capsule_runs.exec_and_wait(RUN_ID, "sqlite3", [":memory:"])

    assert str(result.status) == "Error"
    assert result.exit_code == 127
    assert "command not found" in (result.output_error or "")


def test_a_command_the_capsule_ended_first_raises(mock: respx.MockRouter, client: maitento.Maitento, clock: List[float]) -> None:
    """The same text in every SDK: ``Capsule command <id> ended AbortedOnTermination: <details>``."""
    mock.post(COMMANDS).mock(return_value=httpx.Response(200, json=command()))
    mock.get(ONE_COMMAND).mock(
        return_value=httpx.Response(
            200,
            json=command("AbortedOnTermination", failureDetails="The capsule run ended (Killed) before the command finished"),
        )
    )

    with pytest.raises(maitento.CapsuleCommandAbortedError) as caught:
        client.capsule_runs.exec_and_wait(RUN_ID, "python3")

    assert str(caught.value) == (
        f"Capsule command {COMMAND_ID} ended AbortedOnTermination: "
        "The capsule run ended (Killed) before the command finished"
    )
    assert caught.value.run_id == RUN_ID
    assert caught.value.failure_details == "The capsule run ended (Killed) before the command finished"
    assert str(caught.value.command.status) == "AbortedOnTermination"


def test_a_timeout_stops_waiting_and_leaves_the_command_alone(
    mock: respx.MockRouter, client: maitento.Maitento, clock: List[float]
) -> None:
    queue = mock.post(COMMANDS).mock(return_value=httpx.Response(200, json=command()))
    mock.get(ONE_COMMAND).mock(return_value=httpx.Response(200, json=command("Running")))

    with pytest.raises(maitento.TimeoutError) as caught:
        client.capsule_runs.exec_and_wait(RUN_ID, "sleep", ["60"], timeout=3)

    assert str(caught.value) == f"Capsule command {COMMAND_ID} did not finish within 3s."
    assert clock[0] == pytest.approx(3, abs=0.1)
    assert queue.call_count == 1


def test_the_abort_event_stops_waiting(mock: respx.MockRouter, client: maitento.Maitento, clock: List[float]) -> None:
    mock.post(COMMANDS).mock(return_value=httpx.Response(200, json=command()))
    abort = threading.Event()

    def running(_: httpx.Request) -> httpx.Response:
        abort.set()
        return httpx.Response(200, json=command("Running"))

    mock.get(ONE_COMMAND).mock(side_effect=running)

    with pytest.raises(maitento.AbortedError):
        client.capsule_runs.exec_and_wait(RUN_ID, "sleep", ["60"], abort=abort)


def test_get_command_reads_one_command(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    mock.get(ONE_COMMAND).mock(return_value=httpx.Response(200, json=command("Finished", exitCode=0)))
    mock.get(f"{COMMANDS}/00000000-0000-4000-8000-000000000000").mock(return_value=httpx.Response(404, json={}))

    assert client.capsule_runs.get_command(RUN_ID, COMMAND_ID).exit_code == 0
    with pytest.raises(maitento.NotFoundError):
        client.capsule_runs.get_command(RUN_ID, "00000000-0000-4000-8000-000000000000")


async def test_async_exec_and_wait(mock: respx.MockRouter, aclient: maitento.AsyncMaitento, clock: List[float]) -> None:
    mock.post(COMMANDS).mock(return_value=httpx.Response(200, json=command()))
    mock.get(ONE_COMMAND).mock(side_effect=reads(command("Running"), command("Finished", exitCode=0, outputStandard="ok\n")))

    result = await aclient.capsule_runs.exec_and_wait(RUN_ID, "echo", ["ok"])

    assert result.output_standard == "ok\n"


# --------------------------------------------------------------------------------------------------------- socket


@pytest.fixture
def server() -> Iterator[FakeNotifications]:
    with FakeNotifications(authorization=API_KEY_HEADER) as fake:
        yield fake


def test_waits_over_the_socket_without_polling(server: FakeNotifications) -> None:
    def queue(_: httpx.Request) -> httpx.Response:
        # Another run's event and an unfinished state change nothing; the finished one ends the wait.
        server.send("capsule-process-updated", capsule_run("Running", command("Finished"), run_id="0e0e0e0e-0000-4000-8000-000000000000"))
        server.send("capsule-process-updated", capsule_run("Running", command("Running")))
        server.send("capsule-process-updated", capsule_run("Running", command("Finished", exitCode=0, outputStandard="Python 3.11.2\n")))
        return httpx.Response(200, json=command())

    with respx.mock(base_url=server.url, assert_all_called=False) as http:
        http.post(COMMANDS).mock(side_effect=queue)
        read = http.get(ONE_COMMAND).mock(return_value=httpx.Response(200, json=command("Running")))
        with maitento.Maitento(API_KEY, base_url=server.url, namespace="demo", environ={}) as mt:
            mt.events.connect()
            result = mt.capsule_runs.exec_and_wait(RUN_ID, "python3", ["--version"], timeout=20)
        assert result.output_standard == "Python 3.11.2\n"
        assert read.call_count == 0  # followed entirely over the socket


def test_a_capsule_that_ends_with_the_command_unfinished_raises_over_the_socket(server: FakeNotifications) -> None:
    def queue(_: httpx.Request) -> httpx.Response:
        server.send("capsule-process-updated", capsule_run("Error", command("Running")))
        return httpx.Response(200, json=command())

    with respx.mock(base_url=server.url, assert_all_called=False) as http:
        http.post(COMMANDS).mock(side_effect=queue)
        with maitento.Maitento(API_KEY, base_url=server.url, namespace="demo", environ={}) as mt:
            mt.events.connect()
            with pytest.raises(maitento.CapsuleCommandAbortedError) as caught:
                mt.capsule_runs.exec_and_wait(RUN_ID, "sleep", ["60"], timeout=20)
        assert "ended (Error) before the command finished" in str(caught.value)


def test_rereads_the_command_when_the_socket_is_quiet(server: FakeNotifications, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sync_run, "SOCKET_RESYNC", 0.2)
    with respx.mock(base_url=server.url, assert_all_called=False) as http:
        http.post(COMMANDS).mock(return_value=httpx.Response(200, json=command()))
        read = http.get(ONE_COMMAND).mock(return_value=httpx.Response(200, json=command("Finished", exitCode=0)))
        with maitento.Maitento(API_KEY, base_url=server.url, namespace="demo", environ={}) as mt:
            mt.events.connect()
            result = mt.capsule_runs.exec_and_wait(RUN_ID, "ls", timeout=20)
        assert result.exit_code == 0 and read.call_count == 1


async def test_async_waits_over_the_socket(server: FakeNotifications, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(async_run, "SOCKET_RESYNC", 30.0)

    def queue(_: httpx.Request) -> httpx.Response:
        server.send("capsule-process-updated", capsule_run("Running", command("Finished", exitCode=0)))
        return httpx.Response(200, json=command())

    with respx.mock(base_url=server.url, assert_all_called=False) as http:
        http.post(COMMANDS).mock(side_effect=queue)
        read = http.get(ONE_COMMAND).mock(return_value=httpx.Response(200, json=command("Running")))
        async with maitento.AsyncMaitento(API_KEY, base_url=server.url, namespace="demo", environ={}) as mt:
            await mt.events.connect()
            result = await mt.capsule_runs.exec_and_wait(RUN_ID, "ls", timeout=20)
        assert result.exit_code == 0 and read.call_count == 0
