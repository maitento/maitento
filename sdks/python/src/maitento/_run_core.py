"""What the ``run()`` helpers need to know about each kind of process, and the transcript helper. No I/O here."""

from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass
from typing import Any, FrozenSet, List, Optional, Tuple

from ._generated.models import (
    AppProcess,
    CapsuleProcess,
    CodePipelineProcess,
    InteractionProcess,
)

__all__ = ["APP", "CAPSULE", "INTERACTION", "PIPELINE", "ProcessKind", "TranscriptEntry", "transcript"]

TERMINAL: FrozenSet[str] = frozenset({"Finished", "Error", "Killed"})
FAILED: FrozenSet[str] = frozenset({"Error", "Killed"})


@dataclass(frozen=True)
class ProcessKind:
    """One kind of process a ``run()`` helper follows."""

    type: str
    """``ProcessType`` as the kill/retention routes spell it."""
    get_path: str
    model: Any
    update_event: str
    """The user-scope event carrying the run's new state."""
    waiting: FrozenSet[str]
    """Statuses in which the run needs a person."""
    summary_only: bool = False
    """The update event carries a summary, so the run is re-read on it."""
    stream_event: Optional[str] = None
    label: str = ""
    """How errors name this kind of run ("Code pipeline"); the process type when empty."""

    @property
    def events(self) -> FrozenSet[str]:
        names = {self.update_event, "process-updated", "reconnected"}
        if self.stream_event:
            names.add(self.stream_event)
        return frozenset(names)


INTERACTION = ProcessKind(
    type="Interaction",
    get_path="/interactions/processes/by-id/{id}",
    model=InteractionProcess,
    update_event="interaction-process-updated",
    waiting=frozenset({"HumanInteractionRequired", "PendingApproval"}),
    stream_event="interaction-process-stream",
)
APP = ProcessKind(
    type="App",
    get_path="/apps/processes/by-id/{id}",
    model=AppProcess,
    update_event="app-process-updated",
    waiting=frozenset({"HumanInteractionRequired"}),
)
CAPSULE = ProcessKind(
    type="Capsule",
    get_path="/capsule-processes/by-id/{id}",
    model=CapsuleProcess,
    update_event="capsule-process-updated",
    waiting=frozenset(),
)
PIPELINE = ProcessKind(
    type="CodePipeline",
    get_path="/code-pipelines/processes/by-id/{id}",
    model=CodePipelineProcess,
    update_event="code-pipeline-process-updated",
    waiting=frozenset({"HumanInteractionRequired"}),
    summary_only=True,
    label="Code pipeline",
)


def describe(kind: ProcessKind, run_id: str) -> str:
    """How every Maitento SDK names a run in its errors: ``Interaction run <id>``, ``Code pipeline run <id>``, ..."""
    return f"{kind.label or kind.type} run {run_id}"


def failure_message(kind: ProcessKind, run_id: str, status: str, details: Optional[str]) -> str:
    """``App run <id> ended Error: <details>``, or ``... ended Killed.`` when the run recorded nothing: the same text in
    every SDK."""
    return f"{describe(kind, run_id)} ended {status}" + (f": {details}" if details and details.strip() else ".")


def timeout_message(kind: ProcessKind, run_id: str, seconds: float) -> str:
    """``Interaction run <id> did not finish within 2s.``: the same text in every SDK."""
    return f"{describe(kind, run_id)} did not finish within {round(seconds, 3):g}s."


COMMAND_FINAL: FrozenSet[str] = frozenset({"Finished", "Error", "AbortedOnTermination"})
"""A capsule command's final statuses."""


def command_timeout_message(command_id: str, seconds: float) -> str:
    """``Capsule command <id> did not finish within 2s.``: the same text in every SDK."""
    return f"Capsule command {command_id} did not finish within {round(seconds, 3):g}s."


def command_aborted_message(command: Any) -> str:
    """``Capsule command <id> ended AbortedOnTermination: <details>``: the same text in every SDK."""
    details = getattr(command, "failure_details", None)
    return f"Capsule command {getattr(command, 'id', '?')} ended {status_of(command)}" + (
        f": {details}" if details and str(details).strip() else "."
    )


def command_as_seen_in(command: Any, run: Any) -> Any:
    """``command`` as it reads in ``run``: one still ``Pending`` or ``Running`` in a run that has ended can never finish,
    so it reads as ``AbortedOnTermination``, as the server's read of one command does."""
    if status_of(command) in COMMAND_FINAL or status_of(run) not in TERMINAL:
        return command
    reason = (
        "before this command could run" if status_of(command) == "Pending" else "before the command finished"
    )
    return command.model_copy(
        update={
            "status": "AbortedOnTermination",
            "failure_details": f"The capsule run ended ({status_of(run)}) {reason}",
        }
    )


def status_of(run: Any) -> str:
    return str(getattr(run, "status", ""))


def is_terminal(run: Any) -> bool:
    return status_of(run) in TERMINAL


def is_failure(run: Any) -> bool:
    return status_of(run) in FAILED


def snapshot_key(run: Any) -> Tuple[str, Any]:
    """Changes whenever the run has a new state."""
    return status_of(run), getattr(run, "date_updated", None)


def is_newer(run: Any, than: Any) -> bool:
    """Whether ``run`` is not older than ``than`` (deliveries can arrive late or twice)."""
    if than is None:
        return True
    new, old = getattr(run, "date_updated", None), getattr(than, "date_updated", None)
    if isinstance(new, _dt.datetime) and isinstance(old, _dt.datetime):
        return new >= old
    return True


def waiting_key(kind: ProcessKind, run: Any) -> Optional[Tuple[str, Any]]:
    """Identifies one episode of waiting for a person (``None`` when not waiting), so ``on_waiting`` fires once each
    time the run enters a waiting status (and again for each new pending approval), not on every update."""
    status = status_of(run)
    if status not in kind.waiting:
        return None
    approval = getattr(run, "pending_approval", None)
    return status, getattr(approval, "id", None)


@dataclass(frozen=True)
class TranscriptEntry:
    """One item of an interaction run's conversation, in the order it happened."""

    kind: str
    """The context array it came from: ``agent_message``, ``human_message``, ``tool_call``, ``tool_result``, ..."""
    sequence: int
    author: Any
    date: Any
    item: Any
    """The full context item (its model has the kind-specific fields, e.g. ``message``)."""

    @property
    def text(self) -> Optional[str]:
        """The item's text when it has one (``message``, ``content``, ``result``, ...)."""
        for name in ("message", "content", "text", "result", "summary", "answer", "question"):
            value = getattr(self.item, name, None)
            if isinstance(value, str):
                return value
        return None


def transcript(run: Any) -> List[TranscriptEntry]:
    """An interaction run's conversation: every context item of every kind, sorted by ``sequence``."""
    context = getattr(run, "context", None)
    if context is None:
        return []
    entries: List[TranscriptEntry] = []
    for kind in type(context).model_fields:
        items = getattr(context, kind, None) or []
        for item in items:
            entries.append(
                TranscriptEntry(
                    kind=kind,
                    sequence=int(getattr(item, "sequence", 0)),
                    author=getattr(item, "author", None),
                    date=getattr(item, "date", None),
                    item=item,
                )
            )
    entries.sort(key=lambda entry: entry.sequence)
    return entries
