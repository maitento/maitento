"""The I/O-free half of every HTTP call: building requests, decoding responses, mapping errors, retry policy.

Both transports (``_async/_transport.py`` and the generated ``_sync/_transport.py``) use these, so the wire rules
live in exactly one place.
"""

from __future__ import annotations

import datetime as _dt
import email.utils
import enum
import json
import random
import re
import typing
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple, Type, TypeVar, Union
from urllib.parse import quote

import pydantic

from ._generated import _runtime as _rt
from .errors import (
    ApiError,
    AuthenticationError,
    ConflictError,
    FileIngestionError,
    NotFoundError,
    PermissionError,
    RateLimitError,
    RequestTooLargeError,
    ResponseParseError,
    ValidationError,
    ValidationFailure,
)

__all__ = [
    "NO_BODY",
    "QueryPairs",
    "RETRY_STATUSES",
    "RequestSpec",
    "build_model",
    "decode_body",
    "error_for",
    "format_query_value",
    "inputs_list",
    "parse",
    "path",
    "query",
    "retry_delay",
    "retry_after_seconds",
    "wire",
]

M = TypeVar("M", bound=pydantic.BaseModel)
T = TypeVar("T")

RETRY_STATUSES = frozenset({429, 502, 503, 504})
"""Statuses worth retrying (idempotent calls only)."""

_IDEMPOTENT_METHODS = frozenset({"GET", "HEAD", "DELETE"})

QueryPairs = List[Tuple[str, Union[str, int, float, bool, None]]]
"""Query parameters in order (a name may repeat). Typed as httpx expects them."""


class _NoBody:
    def __repr__(self) -> str:
        return "NO_BODY"


NO_BODY: Any = _NoBody()
"""Marks a request that sends no body (``None`` would be sent as JSON ``null``)."""


@dataclass
class RequestSpec:
    """One API call, described without doing it."""

    method: str
    path: str
    query: QueryPairs = field(default_factory=list)
    json: Any = NO_BODY
    files: Optional[Dict[str, Any]] = None
    accept: str = "application/json"
    idempotent: bool = False
    """Marks a non-GET call as safe to retry (reads sent as POST/PUT). Starts, builds and ingests never are."""
    timeout: Optional[float] = None
    authenticated: bool = True
    authorization: Optional[str] = None
    """An explicit ``Authorization`` value (used by login and renewal); otherwise the client's credential."""
    expect_body: bool = False
    """A 204 or empty body is then a :class:`NotFoundError` (the server's way of saying "no such thing" on some gets)."""

    @property
    def retryable(self) -> bool:
        return self.method.upper() in _IDEMPOTENT_METHODS or self.idempotent


# ----------------------------------------------------------------------------------------------------------- requests


def path(template: str, **params: Any) -> str:
    """Fills ``{name}`` placeholders, percent-encoding each value as one path segment."""

    def replace(match: "re.Match[str]") -> str:
        name = match.group(1)
        if name not in params:
            raise KeyError(f"missing path parameter {name!r} for {template}")
        value = params[name]
        if value is None or (isinstance(value, str) and not value.strip()):
            raise ValueError(f"{name} is required")
        return quote(format_query_value(value), safe="")

    return re.sub(r"\{(\w+)\}", replace, template)


def format_query_value(value: Any) -> str:
    """How a scalar travels in a URL: bools lowercase, enums by value, dates as UTC ISO-8601 with ``Z``."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, enum.Enum):
        return str(value.value)
    if isinstance(value, _dt.datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=_dt.timezone.utc)
        return str(value.astimezone(_dt.timezone.utc).isoformat()).replace("+00:00", "Z")
    if isinstance(value, _dt.date):
        return value.isoformat()
    if isinstance(value, _dt.timedelta):
        return _rt.format_dotnet_timespan(value)
    return str(value)


def query(*pairs: Tuple[str, Any], csv: Sequence[str] = ()) -> QueryPairs:
    """Query parameters: ``None`` is left out, a list repeats the name (``a=1&a=2``) unless the name is in ``csv``
    (then the values are joined with commas, as ``GET /processes`` wants for ``ids``/``types``/``statuses``)."""
    result: QueryPairs = []
    for name, value in pairs:
        if value is None:
            continue
        if isinstance(value, (list, tuple, set, frozenset)):
            values = [format_query_value(v) for v in value if v is not None]
            if not values:
                continue
            if name in csv:
                result.append((name, ",".join(values)))
            else:
                result.extend((name, v) for v in values)
        else:
            result.append((name, format_query_value(value)))
    return result


def inputs_list(inputs: Any) -> Any:
    """Start ``inputs`` given as a mapping (``{"name": "Ada"}``) become the wire's ``[{name, value}]`` list.

    A ``None`` value is left out, as the TypeScript SDK leaves out ``null``: the input is then simply not given, rather
    than given as the text ``"None"``.
    """
    if isinstance(inputs, Mapping):
        return [
            {"name": str(name), "value": _input_value(value)} for name, value in inputs.items() if value is not None
        ]
    return inputs


def _input_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    return format_query_value(value)


def _field_names(model: Type[pydantic.BaseModel]) -> Dict[str, str]:
    """Every accepted spelling of each field (attribute name and camelCase alias) -> attribute name."""
    names: Dict[str, str] = {}
    for name, info in model.model_fields.items():
        names[name] = name
        if info.alias:
            names[info.alias] = name
    return names


def build_model(
    model: Type[M],
    request: Union[M, Mapping[str, Any], None],
    fields: Mapping[str, Any],
    *,
    defaults: Optional[Mapping[str, Any]] = None,
) -> M:
    """A request model from a model instance, a mapping (either spelling), keyword fields, or a mix.

    Keyword ``fields`` must name real fields (a typo is a ``TypeError``, not a silently ignored extra).
    """
    names = _field_names(model)
    unknown = [key for key in fields if key not in names]
    if unknown:
        raise TypeError(f"{model.__name__} has no field(s) {', '.join(map(repr, unknown))}")
    if isinstance(request, model) and not fields:
        return request
    data: Dict[str, Any] = {}
    if isinstance(request, pydantic.BaseModel):
        data = request.model_dump(exclude_unset=True)
    elif isinstance(request, Mapping):
        data = {names.get(key, key): value for key, value in request.items()}
    elif request is not None:
        raise TypeError(f"expected a {model.__name__}, a mapping or None, not {type(request).__name__}")
    merged: Dict[str, Any] = {}
    for key, value in (defaults or {}).items():
        merged[names.get(key, key)] = value
    merged.update(data)
    merged.update({names[key]: value for key, value in fields.items()})
    return model.model_validate(_fill_collections(model, merged))


def _model_class(annotation: Any) -> Optional[Type[pydantic.BaseModel]]:
    """``X`` for an annotation that is a model ``X`` or ``Optional[X]`` (not a union of several models)."""
    # `typing.get_origin` first: on Python 3.10 a generic alias such as `list[str]` passes `isinstance(x, type)`.
    if typing.get_origin(annotation) is None and isinstance(annotation, type):
        return annotation if issubclass(annotation, pydantic.BaseModel) else None
    if typing.get_origin(annotation) is Union:
        members = [arg for arg in typing.get_args(annotation) if arg is not type(None)]
        if len(members) == 1:
            return _model_class(members[0])
    return None


def _collection(annotation: Any) -> Tuple[Optional[type], Any]:
    """``(list, item annotation)`` / ``(dict, None)`` for a list/dict annotation (or its ``Optional``)."""
    origin = typing.get_origin(annotation)
    if origin in (list, List):
        args = typing.get_args(annotation)
        return list, args[0] if args else Any
    if origin in (dict, Dict):
        return dict, None
    if origin is Union:
        members = [arg for arg in typing.get_args(annotation) if arg is not type(None)]
        if len(members) == 1:
            return _collection(members[0])
    return None, None


def _fill_collections(model: Type[pydantic.BaseModel], data: Mapping[str, Any]) -> Dict[str, Any]:
    """Sends ``[]``/``{}`` for every required collection the caller left out, at every level they gave as a mapping,
    so a request names only what it has (``create_one_shot(name=..., prompt=..., agent={...})``)."""
    if not model.__pydantic_complete__:
        model.model_rebuild()
    names = _field_names(model)
    result = {names.get(key, key): value for key, value in data.items()}
    for name, info in model.model_fields.items():
        kind, item = _collection(info.annotation)
        if name not in result:
            if info.is_required() and kind is not None:
                result[name] = kind()
            continue
        value = result[name]
        nested = _model_class(info.annotation)
        if nested is not None and isinstance(value, Mapping):
            result[name] = _fill_collections(nested, value)
        elif kind is list and isinstance(value, list):
            item_model = _model_class(item)
            if item_model is not None:
                result[name] = [_fill_collections(item_model, v) if isinstance(v, Mapping) else v for v in value]
    return result


def wire(value: Any) -> Any:
    """The JSON to send for a model, a list of models, or plain data (discriminators first, unset fields left out)."""
    if isinstance(value, pydantic.BaseModel):
        return _rt.to_wire(value)
    if isinstance(value, (list, tuple)):
        return [wire(item) for item in value]
    if isinstance(value, Mapping):
        return {key: wire(item) for key, item in value.items()}
    return value


# ---------------------------------------------------------------------------------------------------------- responses

_adapters: Dict[Any, "pydantic.TypeAdapter[Any]"] = {}


def _adapter(tp: Any) -> "pydantic.TypeAdapter[Any]":
    try:
        adapter = _adapters.get(tp)
    except TypeError:  # unhashable annotation
        return pydantic.TypeAdapter(tp)
    if adapter is None:
        adapter = pydantic.TypeAdapter(tp)
        _adapters[tp] = adapter
    return adapter


def parse(tp: Any, data: Any) -> Any:
    """Validates decoded JSON into ``tp`` (a model, ``List[Model]``, a union alias, ...)."""
    try:
        return _adapter(tp).validate_python(data)
    except pydantic.ValidationError as error:
        name = getattr(tp, "__name__", None) or repr(tp)
        raise ResponseParseError(f"The response did not match {name}: {error}", body=data) from error


_JSON = re.compile(r"^application/(?:[\w.+-]+\+)?json\b", re.IGNORECASE)


def decode_body(content_type: Optional[str], content: bytes) -> Any:
    """By ``Content-Type``, never by guessing: JSON is parsed, ``text/*`` is text, anything else stays bytes."""
    if not content:
        return None
    media = (content_type or "").split(";")[0].strip().lower()
    if _JSON.match(media):
        return json.loads(content)
    if media.startswith("text/"):
        return content.decode(_charset(content_type) or "utf-8", errors="replace")
    return content


def _charset(content_type: Optional[str]) -> Optional[str]:
    match = re.search(r"charset=\"?([\w.-]+)", content_type or "", re.IGNORECASE)
    return match.group(1) if match else None


# ------------------------------------------------------------------------------------------------------------- errors


def retry_after_seconds(headers: Mapping[str, str], body: Any = None, *, now: Optional[float] = None) -> Optional[float]:
    """``Retry-After`` (seconds or an HTTP date), else the body's ``retryAfterSeconds``."""
    raw = _header(headers, "retry-after")
    if raw:
        raw = raw.strip()
        try:
            return max(float(raw), 0.0)
        except ValueError:
            try:
                when = email.utils.parsedate_to_datetime(raw)
            except (TypeError, ValueError):
                when = None
            if when is not None:
                if when.tzinfo is None:
                    when = when.replace(tzinfo=_dt.timezone.utc)
                current = now if now is not None else _dt.datetime.now(_dt.timezone.utc).timestamp()
                return max(when.timestamp() - current, 0.0)
    if isinstance(body, Mapping):
        seconds = body.get("retryAfterSeconds")
        if isinstance(seconds, (int, float)) and not isinstance(seconds, bool):
            return max(float(seconds), 0.0)
    return None


def _header(headers: Mapping[str, str], name: str) -> Optional[str]:
    for key, value in headers.items():
        if key.lower() == name:
            return value
    return None


def error_for(
    status: int,
    headers: Mapping[str, str],
    content: bytes,
    *,
    method: Optional[str] = None,
    url: Optional[str] = None,
    reason: str = "",
) -> ApiError:
    """The typed error for a non-2xx response (the server has four body shapes; see the wire contract)."""
    try:
        body = decode_body(_header(headers, "content-type"), content)
    except ValueError:
        body = content.decode("utf-8", errors="replace")
    code: Optional[str] = None
    detail = ""
    if isinstance(body, Mapping):
        raw_code = body.get("code")
        code = raw_code if isinstance(raw_code, str) else None
        error_text = body.get("error") or body.get("message") or body.get("title")
        detail = error_text if isinstance(error_text, str) else ""
    elif isinstance(body, str):
        detail = body.strip()[:500]
    target = f"{method} {url}" if method and url else (url or "")
    prefix = f"{status}{' ' + reason if reason else ''}"
    common: Dict[str, Any] = {"status": status, "body": body, "headers": headers, "method": method, "url": url}

    def message(text: str) -> str:
        parts = [prefix]
        if text:
            parts.append(text)
        return f"{': '.join(parts)}{f' ({target})' if target else ''}"

    if status == 400 and isinstance(body, Mapping) and isinstance(body.get("validationFailures"), list):
        failures = [
            ValidationFailure(
                code=str(item.get("errorCode") or ""),
                member=str(item.get("memberName") or ""),
                message=str(item.get("message") or ""),
            )
            for item in body["validationFailures"]
            if isinstance(item, Mapping)
        ]
        text = "; ".join(f"{f.member}: {f.message}" if f.member else f.message for f in failures)
        return ValidationError(
            message(text), failures=failures, code=code or (failures[0].code if failures else None), **_without(common, "code")
        )
    if status == 401:
        return AuthenticationError(message(detail or "the credential was missing or refused"), code=code, **common)
    if status == 403:
        return PermissionError(message(detail or "not allowed"), code=code, **common)
    if status == 404:
        return NotFoundError(message(detail or "not found"), code=code, **common)
    if status == 409:
        return ConflictError(message(detail or "conflict"), code=code, **common)
    if status == 413:
        limit = body.get("maxRequestBodyBytes") if isinstance(body, Mapping) else None
        return RequestTooLargeError(
            message(detail or "request too large"),
            max_request_body_bytes=limit if isinstance(limit, int) else None,
            code=code,
            **common,
        )
    if status == 422:
        mapping = body if isinstance(body, Mapping) else {}
        ocr = mapping.get("ocrAttempted")
        return FileIngestionError(
            message(detail or "the file could not be ingested"),
            category=mapping.get("category") if isinstance(mapping.get("category"), str) else None,
            ocr_attempted=ocr if isinstance(ocr, bool) else None,
            guidance=mapping.get("guidance") if isinstance(mapping.get("guidance"), str) else None,
            code=code,
            **common,
        )
    if status == 429:
        return RateLimitError(
            message(detail or "rate limited"), retry_after=retry_after_seconds(headers, body), code=code, **common
        )
    return ApiError(message(detail), code=code, **common)


def _without(mapping: Mapping[str, Any], key: str) -> Dict[str, Any]:
    return {k: v for k, v in mapping.items() if k != key}


def retry_delay(
    attempt: int,
    *,
    retry_after: Optional[float] = None,
    rng: Callable[[], float] = random.random,
    base: float = 0.5,
    cap: float = 8.0,
    max_retry_after: float = 60.0,
) -> float:
    """Seconds to wait before retry number ``attempt`` (0-based): ``Retry-After`` when the server gave one, else
    exponential backoff with jitter (50-100% of ``base * 2**attempt``, capped)."""
    if retry_after is not None:
        return min(retry_after, max_retry_after)
    ceiling = min(cap, base * (2.0**attempt))
    return ceiling * (0.5 + rng() / 2)
