"""The route map covers routes.json exactly, names real methods, and every example really sends its route."""

from __future__ import annotations

import datetime
import json
import os
import pathlib
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

import httpx
import pytest
import respx

import maitento
from factories import for_route_response
from helpers import BASE, SDK_ROOT, routes_json
from maitento._route_map import EXCLUDED, ROUTES

NOT_CALLS = {"PUT /auth", "GET /auth/renew", "GET /notifications"}
"""Routes the client reaches by itself (login, renewal) or over a WebSocket: covered by test_auth / test_events."""


def sdk_routes() -> Dict[str, Dict[str, Any]]:
    return {f"{r['verb']} {r['path']}": r for r in routes_json() if r["sdk"]}


def test_route_map_covers_routes_json_exactly() -> None:
    expected = set(sdk_routes())
    mapped = [entry["route"] for entry in ROUTES]
    excluded = [entry["route"] for entry in EXCLUDED]
    assert len(mapped) == len(set(mapped)), "a route is mapped twice"
    assert not set(mapped) & set(excluded), "a route is both mapped and excluded"
    assert set(mapped) | set(excluded) == expected, {
        "missing": sorted(expected - set(mapped) - set(excluded)),
        "unknown": sorted((set(mapped) | set(excluded)) - expected),
    }


def test_only_anonymous_routes_are_excluded() -> None:
    routes = sdk_routes()
    for entry in EXCLUDED:
        assert routes[entry["route"]]["anonymous"], entry
        assert entry["reason"]


def resolve(client: Any, method: str) -> Any:
    if method.startswith("Maitento("):
        return type(client)
    target: Any = client
    for part in method.split("."):
        if part.endswith("()"):  # vfs.open().read_text: open a handle, then look the method up on it
            target = getattr(target, part[:-2])("notes")
        else:
            target = getattr(target, part)
    return target


@pytest.mark.parametrize("entry", ROUTES, ids=[e["route"] for e in ROUTES])
def test_every_method_exists_on_both_clients(entry: Dict[str, str]) -> None:
    sync = maitento.Maitento("u:s", base_url=BASE, namespace="demo", environ={})
    async_ = maitento.AsyncMaitento("u:s", base_url=BASE, namespace="demo", environ={})
    assert callable(resolve(sync, entry["method"]))
    assert callable(resolve(async_, entry["method"]))
    assert entry["example"].count("\n") == 0


def template_regex(path: str) -> "re.Pattern[str]":
    pattern = re.sub(r"\\\{\w+\\\}", r"[^/]+", re.escape(path))
    return re.compile(f"^{pattern}$")


def fake_response(route: Dict[str, Any]) -> httpx.Response:
    status = route["successStatus"] or 200
    kind = route["responseContentType"]
    if route["responseType"] is None:
        return httpx.Response(status if status != 200 else 204)
    if kind == "application/octet-stream":
        return httpx.Response(200, content=b"\x89PNG", headers={"Content-Type": "application/octet-stream"})
    if kind == "text/plain":
        return httpx.Response(200, text="plain text", headers={"Content-Type": "text/plain; charset=utf-8"})
    body = for_route_response(route["responseType"])
    if route["responseType"].endswith("Page"):
        body["nextCursor"] = None
    if route["responseType"] == "BuildResponse":
        body["isSuccess"] = True
    return httpx.Response(200, json=body)


CALLABLE = [e for e in ROUTES if e["route"] not in NOT_CALLS]


@pytest.mark.parametrize("entry", CALLABLE, ids=[e["route"] for e in CALLABLE])
def test_every_example_sends_its_route(entry: Dict[str, str], tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    route = sdk_routes()[entry["route"]]
    verb, template = entry["route"].split(" ", 1)
    monkeypatch.chdir(tmp_path)
    (tmp_path / "maitento" / "agents").mkdir(parents=True)
    (tmp_path / "maitento" / "agents" / "greeter.mtr").write_text('model = @ref("deepseek.deepseek-v4-flash")')
    (tmp_path / "handbook.pdf").write_bytes(b"%PDF-1.7")
    (tmp_path / "logo.png").write_bytes(b"\x89PNG")
    for name in ("MAITENTO_PASSWORD", "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "ORDERS_API_KEY", "WEBHOOK_SECRET", "CLAUDE_ACCESS_TOKEN", "CLAUDE_REFRESH_TOKEN"):
        monkeypatch.setenv(name, "placeholder")
    sent: List[Tuple[str, str]] = []

    def respond(request: httpx.Request) -> httpx.Response:
        sent.append((request.method, request.url.raw_path.decode("ascii").split("?")[0]))
        return fake_response(route)

    with respx.mock(base_url=BASE, assert_all_called=False) as http:
        http.route().mock(side_effect=respond)
        with maitento.Maitento("u:s", base_url=BASE, namespace="demo", environ={}) as mt:
            result = eval(entry["example"], {"mt": mt, "os": os, "datetime": datetime, "maitento": maitento, "pathlib": pathlib})
            if isinstance(result, maitento.Page):
                list(result.items)
    assert len(sent) == 1, sent
    method, sent_path = sent[0]
    assert method == verb
    assert template_regex(template).match(sent_path), (sent_path, template)


def test_route_map_json_is_up_to_date() -> None:
    sys.path.insert(0, str(SDK_ROOT / "scripts"))
    import write_route_map

    committed = (SDK_ROOT / "route-map.json").read_text(encoding="utf-8")
    assert committed == write_route_map.render(), "run python scripts/write_route_map.py"
    document = json.loads(committed)
    assert len(document["routes"]) == len(ROUTES) and len(document["excluded"]) == len(EXCLUDED)
