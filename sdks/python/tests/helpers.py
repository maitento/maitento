"""Shared test constants and helpers."""

from __future__ import annotations

import base64
import json
import time
from pathlib import Path
from typing import Any, Dict, List

import pytest

from factories import sample

BASE = "http://mt.test"
USER_ID = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b"
SECRET = "c2VjcmV0LXNlY3JldA=="
API_KEY = f"{USER_ID}:{SECRET}"
API_KEY_HEADER = f"ApiKey {USER_ID} {SECRET}"
SDK_ROOT = Path(__file__).resolve().parent.parent
ROUTES_JSON = SDK_ROOT.parent / "routes.json"
RUN_ID = "b7e6d5c4-3a2b-4c1d-8e9f-0a1b2c3d4e5f"


def jwt(exp: float, iat: float, sub: str = USER_ID) -> str:
    """An unsigned JWT with the given times (the SDK never verifies signatures; it only reads exp/iat)."""

    def part(value: Dict[str, Any]) -> str:
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")

    return f"{part({'alg': 'none', 'typ': 'JWT'})}.{part({'oid': sub, 'exp': int(exp), 'iat': int(iat)})}.sig"


def auth_response(token: str, expires: float) -> Dict[str, Any]:
    when = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(expires))
    return {"authenticationToken": {"expires": when, "token": token}, "user": sample("User"), "tenantName": "Acme"}


def routes_json() -> List[Dict[str, Any]]:
    """``maitento/public/sdks/routes.json`` (next to this package in the repository; absent from an sdist)."""
    if not ROUTES_JSON.exists():
        pytest.skip("routes.json is not next to the package (run the tests from the repository)")
    return json.loads(ROUTES_JSON.read_text(encoding="utf-8"))["routes"]  # type: ignore[no-any-return]


def interaction_run(status: str = "New", run_id: str = RUN_ID, **overrides: Any) -> Dict[str, Any]:
    """An ``InteractionProcess`` body (``dateUpdated`` 10:00:00 unless given: later states pass a later time)."""
    body = sample("InteractionProcess", id=run_id, status=status, dateUpdated="2026-10-26T10:00:00Z")
    body.update(overrides)
    return body
