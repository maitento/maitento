"""Following a run to its end: the engine behind ``interactions.run``, ``apps.run``, ``capsules.run`` and
``pipelines.run``, and waiting for one capsule command (``capsule_runs.exec_and_wait``).

It follows over the event socket when one is open (and still re-reads the run now and then, because delivery is
at-most-once), and by polling ``GET`` otherwise, every 1 s growing to 5 s.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, Awaitable, Callable, Optional, cast

from .. import _aio
from .._generated.models import CapsuleProcess, CapsuleProcessCommand
from .._http import RequestSpec, parse, path
from .._run_core import (
    COMMAND_FINAL,
    ProcessKind,
    command_aborted_message,
    command_as_seen_in,
    command_timeout_message,
    failure_message,
    is_failure,
    is_newer,
    is_terminal,
    snapshot_key,
    status_of,
    timeout_message,
    waiting_key,
)
from ..errors import AbortedError, CapsuleCommandAbortedError, MaitentoError, ProcessFailedError, TimeoutError
from ._events import AsyncSubscription

if TYPE_CHECKING:
    from ._client import AsyncMaitento

logger = logging.getLogger("maitento")

POLL_FIRST = 1.0
POLL_MAX = 5.0
POLL_GROWTH = 1.5
SOCKET_RESYNC = 15.0
"""With a socket, re-read the run when nothing arrived for this long (a missed event must not hang the helper)."""
ABORT_CHECK = 1.0

TokenCallback = Callable[[str, str], Any]
RunCallback = Callable[[Any], Any]


async def get_run(client: "AsyncMaitento", kind: ProcessKind, run_id: str) -> Any:
    spec = RequestSpec("GET", path(kind.get_path, id=run_id), expect_body=True)
    return parse(kind.model, await client._transport.request(spec))


async def kill_run(client: "AsyncMaitento", kind: ProcessKind, run_id: str) -> None:
    try:
        spec = RequestSpec("POST", path("/processes/{type}/{id}/kill", type=kind.type, id=run_id), json={})
        await client._transport.request(spec)
    except MaitentoError:
        logger.warning("Could not kill %s run %s after aborting.", kind.type, run_id, exc_info=True)


async def start_and_follow(
    client: "AsyncMaitento",
    kind: ProcessKind,
    start: Callable[[], Awaitable[Any]],
    *,
    on_token: Optional[TokenCallback],
    on_update: Optional[RunCallback],
    on_waiting: Optional[RunCallback],
    timeout: Optional[float],
    throw_on_failure: bool,
    kill_on_abort: bool,
    abort: Optional[_aio.Event],
) -> Any:
    """Starts a run (never retried), then follows it to a terminal state."""
    events = client.events
    stream = events._stream_for_runs()
    owned = None
    if stream is None and on_token is not None and kind.stream_event is not None:
        try:
            owned = stream = await events.connect()
        except MaitentoError:
            logger.warning("Could not open the event socket; following the run by polling (no tokens).", exc_info=True)
            stream = None
    subscription = stream.subscribe(kind.events) if stream is not None else None
    try:
        run = await start()
        return await follow(
            client,
            kind,
            run,
            subscription=subscription,
            on_token=on_token,
            on_update=on_update,
            on_waiting=on_waiting,
            timeout=timeout,
            throw_on_failure=throw_on_failure,
            kill_on_abort=kill_on_abort,
            abort=abort,
        )
    finally:
        if subscription is not None:
            subscription.close()
        if owned is not None:
            await owned.close()


async def follow(
    client: "AsyncMaitento",
    kind: ProcessKind,
    run: Any,
    *,
    subscription: Optional[AsyncSubscription] = None,
    on_token: Optional[TokenCallback] = None,
    on_update: Optional[RunCallback] = None,
    on_waiting: Optional[RunCallback] = None,
    timeout: Optional[float] = None,
    throw_on_failure: bool = True,
    kill_on_abort: bool = False,
    abort: Optional[_aio.Event] = None,
) -> Any:
    """Follows ``run`` until it is Finished, Error or Killed and returns it in that state."""
    run_id = str(run.id)
    deadline = None if timeout is None else _aio.monotonic() + timeout
    poll = POLL_FIRST
    idle = 0.0
    last_snapshot: Any = None
    last_waiting: Any = None
    current = run

    try:
        while True:
            if current is run or is_newer(current, run):
                run = current
                snapshot = snapshot_key(run)
                if snapshot != last_snapshot:
                    last_snapshot = snapshot
                    if on_update is not None:
                        await _aio.call(on_update, run)
                    waiting = waiting_key(kind, run)
                    if waiting is not None and waiting != last_waiting and on_waiting is not None:
                        await _aio.call(on_waiting, run)
                    last_waiting = waiting
            if is_terminal(run):
                break
            if abort is not None and abort.is_set():
                if kill_on_abort:
                    await kill_run(client, kind, run_id)
                raise AbortedError(f"Stopped following {kind.type} run {run_id}: aborted.", run=run)
            remaining = None if deadline is None else deadline - _aio.monotonic()
            if remaining is not None and remaining <= 0:
                if kill_on_abort:
                    await kill_run(client, kind, run_id)
                raise TimeoutError(timeout_message(kind, run_id, timeout or 0.0), run=run)

            if subscription is not None and subscription.closed:
                subscription = None
            if subscription is None:
                wait = _bounded(poll, remaining, abort)
                await _aio.sleep(wait)
                if wait >= poll:
                    poll = min(poll * POLL_GROWTH, POLL_MAX)
                current = await get_run(client, kind, run_id)
                continue

            wait = _bounded(SOCKET_RESYNC - idle, remaining, abort)
            waited_from = _aio.monotonic()
            event = await subscription.get(wait)
            if event is None:
                idle += _aio.monotonic() - waited_from
                if idle >= SOCKET_RESYNC:
                    idle = 0.0
                    current = await get_run(client, kind, run_id)
                continue
            if event.name == "reconnected":
                idle = 0.0
                current = await get_run(client, kind, run_id)
                continue
            if event.id is None or event.id.lower() != run_id.lower():
                continue
            if event.name == kind.stream_event:
                if on_token is not None:
                    delta = event.data
                    if str(getattr(delta, "type", "")) == "Chat":
                        await _aio.call(on_token, getattr(delta, "stream", ""), getattr(delta, "agent_name", ""))
                continue
            idle = 0.0
            if event.name == kind.update_event and not kind.summary_only and isinstance(event.data, kind.model):
                current = event.data
            else:
                current = await get_run(client, kind, run_id)
    except _aio.CancelledError:
        if kill_on_abort:
            await kill_run(client, kind, run_id)
        raise

    if is_failure(run) and throw_on_failure:
        details = getattr(run, "failure_details", None) or getattr(run, "failure_reason", None)
        raise ProcessFailedError(
            failure_message(kind, run_id, status_of(run), None if details is None else str(details)),
            run=run,
            failure_details=details,
        )
    return run


COMMAND_POLL_FIRST = 0.25
COMMAND_POLL_MAX = 2.0
"""One capsule command is polled from 0.25 s, growing to 2 s: most finish in a second or two, and the read is small."""
COMMAND_EVENTS = frozenset({"capsule-process-updated", "process-updated", "reconnected"})


async def get_command(client: "AsyncMaitento", run_id: str, command_id: str) -> CapsuleProcessCommand:
    spec = RequestSpec(
        "GET",
        path("/capsule-processes/by-id/{id}/commands/{command}", id=run_id, command=command_id),
        expect_body=True,
    )
    return cast(CapsuleProcessCommand, parse(CapsuleProcessCommand, await client._transport.request(spec)))


async def queue_and_wait(
    client: "AsyncMaitento",
    run_id: str,
    queue: Callable[[], Awaitable[Any]],
    *,
    timeout: Optional[float],
    abort: Optional[_aio.Event],
) -> CapsuleProcessCommand:
    """Queues a capsule command (never retried), then waits for it to reach its final status."""
    stream = client.events._stream_for_runs()
    # Subscribed before the command is queued, so no event about it can be missed.
    subscription = stream.subscribe(COMMAND_EVENTS) if stream is not None else None
    try:
        command = await queue()
        return await wait_for_command(client, run_id, command, subscription=subscription, timeout=timeout, abort=abort)
    finally:
        if subscription is not None:
            subscription.close()


async def wait_for_command(
    client: "AsyncMaitento",
    run_id: str,
    command: Any,
    *,
    subscription: Optional[AsyncSubscription] = None,
    timeout: Optional[float] = None,
    abort: Optional[_aio.Event] = None,
) -> CapsuleProcessCommand:
    """Waits for ``command`` of the capsule run ``run_id`` to end: over the event socket when one is open (each
    ``capsule-process-updated`` event carries the run with its commands; the command is still re-read after a
    reconnect and when nothing arrived for 15 s), by polling the one command otherwise (0.25 s, growing to 2 s).

    Returns a ``Finished`` or ``Error`` command: a non-zero exit code is a result. A command the capsule ended first
    raises :class:`CapsuleCommandAbortedError`.
    """
    command_id = str(command.id)
    deadline = None if timeout is None else _aio.monotonic() + timeout
    poll = COMMAND_POLL_FIRST
    idle = 0.0
    current = command

    while status_of(current) not in COMMAND_FINAL:
        if abort is not None and abort.is_set():
            raise AbortedError(f"Stopped waiting for capsule command {command_id}: aborted.", run=current)
        remaining = None if deadline is None else deadline - _aio.monotonic()
        if remaining is not None and remaining <= 0:
            raise TimeoutError(command_timeout_message(command_id, timeout or 0.0), run=current)

        if subscription is not None and subscription.closed:
            subscription = None
        if subscription is None:
            wait = _bounded(poll, remaining, abort)
            await _aio.sleep(wait)
            if wait >= poll:
                poll = min(poll * POLL_GROWTH, COMMAND_POLL_MAX)
            current = await get_command(client, run_id, command_id)
            continue

        wait = _bounded(SOCKET_RESYNC - idle, remaining, abort)
        waited_from = _aio.monotonic()
        event = await subscription.get(wait)
        if event is None:
            idle += _aio.monotonic() - waited_from
            if idle >= SOCKET_RESYNC:
                idle = 0.0
                current = await get_command(client, run_id, command_id)
            continue
        if event.name == "reconnected":
            idle = 0.0
            current = await get_command(client, run_id, command_id)
            continue
        if event.id is None or event.id.lower() != run_id.lower():
            continue
        idle = 0.0
        run = event.data
        if event.name == "capsule-process-updated" and isinstance(run, CapsuleProcess):
            found = next((c for c in run.commands or [] if str(c.id).lower() == command_id.lower()), None)
            if found is None:
                current = await get_command(client, run_id, command_id)
                continue
            # A command only ever moves on, so a final state is final however late the event.
            seen = command_as_seen_in(found, run)
            if status_of(seen) in COMMAND_FINAL:
                current = seen
            continue
        # A tenant socket's `process-updated` nudge carries no commands: re-read the command.
        current = await get_command(client, run_id, command_id)

    if status_of(current) == "AbortedOnTermination":
        raise CapsuleCommandAbortedError(command_aborted_message(current), command=current, run_id=run_id)
    return cast(CapsuleProcessCommand, current)


def _bounded(wait: float, remaining: Optional[float], abort: Optional[Any]) -> float:
    if remaining is not None:
        wait = min(wait, max(remaining, 0.0))
    if abort is not None:
        wait = min(wait, ABORT_CHECK)
    return max(wait, 0.01)
