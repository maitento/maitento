"""The filters every ``usage.*`` call takes."""

from __future__ import annotations

from typing import Any, List, Mapping, Sequence, Tuple, Union

from typing_extensions import TypedDict

__all__ = ["UsageFilters", "usage_query"]

Values = Union[str, Sequence[str]]


class UsageFilters(TypedDict, total=False):
    """Filters for ``usage.summary/series/breakdown/runs``. Every list filter accepts one value or several.

    ``from_``/``to`` are ``datetime``s or ISO-8601 strings with an offset; ``version`` is ``"<definitionId>:<n>"``.
    """

    from_: Any
    to: Any
    namespace: Values
    type: Values
    definition_id: Values
    version: Values
    agent: Values
    provider: Values
    model: Values
    engine: Values
    credential_kind: Values
    tier: Values
    outcome: Values
    started_by: Values
    trigger_id: Values
    root_definition_id: Values


_WIRE = {
    "from_": "from",
    "to": "to",
    "namespace": "namespace",
    "type": "type",
    "definition_id": "definitionId",
    "version": "version",
    "agent": "agent",
    "provider": "provider",
    "model": "model",
    "engine": "engine",
    "credential_kind": "credentialKind",
    "tier": "tier",
    "outcome": "outcome",
    "started_by": "startedBy",
    "trigger_id": "triggerId",
    "root_definition_id": "rootDefinitionId",
}


def usage_query(filters: Mapping[str, Any]) -> List[Tuple[str, Any]]:
    """``(wire name, value)`` pairs for :func:`maitento._http.query`."""
    unknown = [key for key in filters if key not in _WIRE]
    if unknown:
        raise TypeError(f"unknown usage filter(s): {', '.join(map(repr, unknown))}")
    return [(_WIRE[key], value) for key, value in filters.items()]
