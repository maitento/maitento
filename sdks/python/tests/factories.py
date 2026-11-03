"""Minimal valid wire JSON for any generated model, so tests can fake server responses."""

from __future__ import annotations

import base64
import datetime as dt
import enum
import json
import typing
from typing import Any, Dict

import pydantic

from maitento._generated import models as m

DATE = "2026-10-26T10:15:30.1234567Z"


def _value(annotation: Any) -> Any:
    origin = typing.get_origin(annotation)
    if origin is typing.Annotated:
        base, *meta = typing.get_args(annotation)
        if base is dt.datetime:
            return DATE
        if base is dt.timedelta:
            return "00:00:01"
        if base is bytes:
            return base64.b64encode(b"hi").decode()
        return _value(base)
    if origin is typing.Literal:
        return typing.get_args(annotation)[0]
    if origin in (list, typing.List):
        return []
    if origin in (dict, typing.Dict):
        return {}
    if origin is typing.Union:
        members = [a for a in typing.get_args(annotation) if a is not type(None)]
        for member in members:
            inner = typing.get_args(member)[0] if typing.get_origin(member) is typing.Annotated else member
            if isinstance(inner, type) and inner.__name__ == "UnknownWireModel":
                continue
            return _value(member)
        return None
    if annotation is dt.datetime:  # pydantic keeps a field's Annotated metadata apart from its annotation
        return DATE
    if annotation is dt.timedelta:
        return "00:00:01"
    if annotation is bytes:
        return base64.b64encode(b"hi").decode()
    if annotation is str:
        return "x"
    if annotation is bool:
        return False
    if annotation is int:
        return 0
    if annotation is float:
        return 0.0
    if isinstance(annotation, type) and issubclass(annotation, enum.Enum):
        return list(annotation)[0].value
    if isinstance(annotation, type) and issubclass(annotation, pydantic.BaseModel):
        return sample(annotation)
    return None


def sample(model: Any, **overrides: Any) -> Dict[str, Any]:
    """The smallest JSON object ``model`` accepts (every required field, plus discriminators), with overrides by
    wire name."""
    if isinstance(model, str):
        model = getattr(m, model)
    if not (isinstance(model, type) and issubclass(model, pydantic.BaseModel)):
        value = _value(model)
        if isinstance(value, dict):
            value.update(overrides)
        return value  # type: ignore[no-any-return]
    model.model_rebuild()
    data: Dict[str, Any] = {}
    for name, info in model.model_fields.items():
        literal = typing.get_origin(info.annotation) is typing.Literal
        if info.is_required() or literal:
            data[info.alias or name] = _value(info.annotation)
    data.update(overrides)
    return data


def for_route_response(response_type: str) -> Any:
    """A JSON body for a routes.json ``responseType`` (``Agent``, ``Agent[]``, ``boolean``, ...)."""
    if response_type.endswith("[]"):
        return [for_route_response(response_type[:-2])]
    if response_type == "boolean":
        return True
    if response_type == "string":
        return "text"
    if response_type in ("integer", "number"):
        return 1
    return sample(getattr(m, response_type))


def dumps(value: Any) -> str:
    return json.dumps(value)
