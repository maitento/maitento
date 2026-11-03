"""Maitento and AsyncMaitento have identical surfaces: same groups, same methods, same parameters."""

from __future__ import annotations

import inspect
import sys
from typing import Any, Dict, List

import maitento
from helpers import BASE, SDK_ROOT

SYNC_BY_DESIGN = {"transcript", "open", "open_by_id"}
"""Methods that do no I/O, so they are plain functions on both clients."""


def public_methods(obj: Any) -> Dict[str, Any]:
    return {
        name: getattr(obj, name)
        for name in dir(obj)
        if not name.startswith("_") and callable(getattr(obj, name)) and not inspect.isclass(getattr(obj, name))
    }


def groups(client: Any) -> Dict[str, Any]:
    return {name: value for name, value in vars(client).items() if not name.startswith("_") and name != "namespace"}


def params(fn: Any) -> List[str]:
    return [f"{p.name}:{p.kind.name}:{p.default!r}" for p in inspect.signature(fn).parameters.values()]


def test_same_groups_methods_and_parameters() -> None:
    sync = maitento.Maitento("u:s", base_url=BASE, namespace="demo", environ={})
    async_ = maitento.AsyncMaitento("u:s", base_url=BASE, namespace="demo", environ={})
    assert set(groups(sync)) == set(groups(async_))
    assert len(groups(sync)) == 32
    pairs = [(sync, async_)] + [(groups(sync)[g], groups(async_)[g]) for g in groups(sync)]
    pairs.append((sync.vfs.open("x"), async_.vfs.open("x")))
    checked = 0
    for sync_obj, async_obj in pairs:
        sync_methods, async_methods = public_methods(sync_obj), public_methods(async_obj)
        assert set(sync_methods) == set(async_methods), type(sync_obj).__name__
        for name in sync_methods:
            assert params(sync_methods[name]) == params(async_methods[name]), f"{type(sync_obj).__name__}.{name}"
            assert not inspect.iscoroutinefunction(sync_methods[name]), f"{type(sync_obj).__name__}.{name}"
            if name not in SYNC_BY_DESIGN:
                assert inspect.iscoroutinefunction(async_methods[name]), f"{type(async_obj).__name__}.{name}"
            checked += 1
    assert checked > 250


def test_event_stream_surfaces_match() -> None:
    sync_names = set(public_methods(maitento.EventStream)) | {"__iter__", "__enter__", "__exit__"}
    async_names = set(public_methods(maitento.AsyncEventStream)) | {"__iter__", "__enter__", "__exit__"}
    assert sync_names == async_names
    assert set(public_methods(maitento.Subscription)) == set(public_methods(maitento.AsyncSubscription))
    assert set(public_methods(maitento.Events)) == set(public_methods(maitento.AsyncEvents))
    assert set(public_methods(maitento.Page)) == set(public_methods(maitento.AsyncPage))


def test_generated_sync_code_is_up_to_date() -> None:
    sys.path.insert(0, str(SDK_ROOT / "scripts"))
    import unasync

    for name, text in unasync.generate().items():
        committed = (unasync.SYNC_DIR / name).read_text(encoding="utf-8")
        assert committed == text, f"src/maitento/_sync/{name} is stale: run python scripts/unasync.py"
