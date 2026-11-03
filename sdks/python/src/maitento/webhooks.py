"""Receiving Maitento web-hook deliveries (Maitento calling you).

A delivery is a ``PUT`` of an entity's **latest** state with these headers::

    X-MT-WebHook-Type:         InteractionProcess | AppProcess | CapsuleProcess | CodePipelineProcess | IngestedFile | Billing
    X-MT-WebHook-AssociatedId: the entity id
    X-MT-WebHook-Timestamp:    when Maitento signed the delivery, in Unix seconds
    X-MT-WebHook-Signature:    v1= and the hex HMAC-SHA256 of "{timestamp}." + body, keyed with your secret

Check the signature with ``verify_webhook`` before you trust a delivery. Only Maitento and you know the secret, so a
matching signature proves the delivery came from Maitento and its body wasn't changed on the way; the timestamp is
signed too, so a delivery recorded and sent again later is refused once it is older than the tolerance (5 minutes).
Pass the **raw** body, exactly as it arrived: the signature covers those bytes, so a body that was parsed and turned
back into JSON won't match.

Deliveries are at-least-once and may skip intermediate states: treat each as "the latest snapshot" and ignore one
whose ``date_updated`` is older than what you already hold.

Works with any framework: pass the request headers as a mapping (or ``(name, value)`` pairs) and the raw body.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import math
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable, List, Mapping, Optional, Tuple, Union

import pydantic

from ._generated.models import WEBHOOK_PAYLOADS
from .errors import AuthenticationError

__all__ = [
    "DEFAULT_TOLERANCE",
    "ID_HEADER",
    "SIGNATURE_HEADER",
    "TIMESTAMP_HEADER",
    "TYPE_HEADER",
    "WebhookEvent",
    "parse_webhook",
    "sign_webhook",
    "verify_webhook",
]

TYPE_HEADER = "X-MT-WebHook-Type"
ID_HEADER = "X-MT-WebHook-AssociatedId"
TIMESTAMP_HEADER = "X-MT-WebHook-Timestamp"
SIGNATURE_HEADER = "X-MT-WebHook-Signature"

DEFAULT_TOLERANCE = 300
"""How far a delivery's timestamp may be from your clock, either way, in seconds: 5 minutes."""

Headers = Union[Mapping[str, str], Iterable[Tuple[str, str]]]
RawBody = Union[bytes, bytearray, str]
"""A delivery's body exactly as it arrived: its bytes, or those bytes read as UTF-8 text."""

_TIMESTAMP = re.compile(r"[0-9]{1,15}")


def _header(headers: Headers, name: str, *, every: bool = False) -> Optional[str]:
    """A header's value; with ``every``, all the values of a repeated header, comma-separated."""
    items = headers.items() if isinstance(headers, Mapping) else headers
    lowered = name.lower()
    found: List[str] = []
    for key, value in items:
        key_text = key.decode("latin-1") if isinstance(key, bytes) else str(key)
        if key_text.lower() == lowered:
            found.append(value.decode("latin-1") if isinstance(value, bytes) else str(value))
            if not every:
                break
    return ",".join(found) if found else None


def _raw(body: Any, caller: str) -> bytes:
    if isinstance(body, str):
        return body.encode("utf-8")
    if isinstance(body, (bytes, bytearray)):
        return bytes(body)
    raise TypeError(
        f"{caller} needs the raw body, exactly as it arrived (bytes or str): a parsed JSON object can't be verified. "
        "In FastAPI or Starlette pass `await request.body()`; in Flask, `request.get_data()`."
    )


def _require_secret(secret: str) -> None:
    if not secret:
        raise ValueError("secret is empty: pass the secret the web hook was registered with")


def sign_webhook(secret: str, timestamp: int, body: RawBody) -> str:
    """The ``X-MT-WebHook-Signature`` value Maitento sends with a delivery: ``v1=`` and the lowercase hex HMAC-SHA256
    of ``"{timestamp}." + body``, keyed with ``secret``. Use it in your receiver's tests, to sign a delivery of your own.

    ``timestamp`` is in Unix seconds (an ``int``), and ``body`` is the raw body.
    """
    _require_secret(secret)
    if isinstance(timestamp, bool) or not isinstance(timestamp, int) or timestamp < 0:
        raise ValueError(f"timestamp must be whole Unix seconds (an int), not {timestamp!r}")
    message = f"{timestamp}.".encode("ascii") + _raw(body, "sign_webhook")
    return "v1=" + hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def verify_webhook(
    headers: Headers,
    body: RawBody,
    secret: str,
    *,
    tolerance: float = DEFAULT_TOLERANCE,
    now: Optional[datetime] = None,
) -> bool:
    """Whether a delivery really came from Maitento: its ``X-MT-WebHook-Signature`` matches ``secret``, and its
    ``X-MT-WebHook-Timestamp`` is within ``tolerance`` seconds (default 300) of ``now``, either way. Answer 401 when
    it doesn't.

    ``body`` must be the **raw** body, exactly as it arrived, because the signature covers those bytes: a body that
    was parsed and turned back into JSON won't match, and an already-parsed object raises ``TypeError``. The signature
    is compared in constant time, and the header may carry several comma-separated ``v1=`` values: any one matching is
    enough. A missing or malformed header, a signature that doesn't match, or a timestamp too far from now gives
    ``False``. ``now`` defaults to the current time (a naive ``datetime`` is taken as UTC).
    """
    _require_secret(secret)
    if not math.isfinite(tolerance) or tolerance < 0:
        raise ValueError(f"tolerance must be zero seconds or more, not {tolerance!r}")

    stamp = (_header(headers, TIMESTAMP_HEADER) or "").strip()
    if not _TIMESTAMP.fullmatch(stamp):
        return False
    timestamp = int(stamp)
    if now is None:
        current = time.time()
    else:
        current = (now if now.tzinfo is not None else now.replace(tzinfo=timezone.utc)).timestamp()
    if abs(current - timestamp) > tolerance:
        return False

    given = [part.strip() for part in (_header(headers, SIGNATURE_HEADER, every=True) or "").split(",")]
    candidates = [part for part in given if part.startswith("v1=")]
    if not candidates:
        return False

    expected = sign_webhook(secret, timestamp, body).encode("utf-8")
    matched = False
    for candidate in candidates:
        # Every value is compared, so the time taken doesn't say which one matched.
        matched = hmac.compare_digest(candidate.encode("utf-8"), expected) or matched
    return matched


@dataclass(frozen=True)
class WebhookEvent:
    """One delivery: the entity's ``type`` (a ``WebHookType`` name), its ``id`` and its current state.

    ``entity`` is the parsed model (``InteractionProcess``, ``AppProcess``, ``CapsuleProcess``,
    ``CodePipelineProcess``, ``IngestedFile``, or for ``Billing`` a ``BillingNotice``), or the raw JSON for a type this
    SDK version does not know.
    """

    type: str
    id: Optional[str]
    entity: Any
    raw: Any


def parse_webhook(headers: Headers, body: Union[RawBody, Mapping[str, Any]], *, secret: Optional[str] = None) -> WebhookEvent:
    """Parses a delivery.

    With ``secret``, it first checks the signature as :func:`verify_webhook` does (so ``body`` must then be the raw
    body), and raises :class:`AuthenticationError` when it doesn't match. Without it, nothing is checked: verify the
    raw body first, then parse that same body.
    """
    if secret is not None and not verify_webhook(headers, _raw(body, "parse_webhook"), secret):
        raise AuthenticationError("The web-hook signature did not match, or the delivery is too old.", status=401)
    raw = json.loads(body) if isinstance(body, (bytes, bytearray, str)) else dict(body)
    kind = _header(headers, TYPE_HEADER) or ""
    entity_id = _header(headers, ID_HEADER)
    if entity_id is None and isinstance(raw, dict) and isinstance(raw.get("id"), str):
        entity_id = raw["id"]
    model = WEBHOOK_PAYLOADS.get(kind)
    entity: Any = raw
    if model is not None and isinstance(raw, dict):
        try:
            entity = model.model_validate(raw)
        except pydantic.ValidationError:
            entity = raw
    return WebhookEvent(type=kind, id=entity_id, entity=entity, raw=raw)
