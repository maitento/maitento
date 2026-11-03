"""Live smoke test against a running Maitento API. Opt-in: ``pytest -m live -s``.

Needs ``MAITENTO_BASE_URL``, ``MAITENTO_API_KEY`` (``"<userId>:<secret>"``, Tenant.Admin) and
``MAITENTO_TEST_DEEPSEEK_KEY`` (sent as the run's own DeepSeek credential). It deploys a tiny project into the
``sdk-py-live`` namespace and runs it with both clients. Nothing here prints a secret.
"""

from __future__ import annotations

import os
import time
from typing import Any, Dict, List

import pytest

import maitento

pytestmark = pytest.mark.live

NAMESPACE = "sdk-py-live"
MODEL = "deepseek.deepseek-v4-flash"
PROJECT: Dict[str, str] = {
    "agents/sdk-greeter.mtr": (
        f'model = @ref("{MODEL}")\n'
        'prompt = "You are a friendly assistant. Answer in one short sentence."\n'
        'summary = "A friendly assistant"\n'
    ),
    "interactions/one-shot/hello.mtr": (
        "agent = {\n"
        '  name = "Greeter"\n'
        '  agent = @ref("sdk-greeter")\n'
        "}\n"
        'task = "Say hello to %%name%% and mention one fact about the Python language."\n'
        "inputs.prompts = [\n"
        "  {\n"
        '    name = "name"\n'
        "    required = true\n"
        "  }\n"
        "]\n"
    ),
}


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        pytest.skip(f"{name} is not set")
    return value


@pytest.fixture(scope="module")
def credentials() -> List[Dict[str, Any]]:
    key = required_env("MAITENTO_TEST_DEEPSEEK_KEY")
    required_env("MAITENTO_API_KEY")
    required_env("MAITENTO_BASE_URL")
    return [{"provider": "DeepSeek", "apiKey": key, "credentialId": "sdk-live", "isOwnLicense": True, "priority": 0}]


@pytest.fixture(scope="module")
def deployed(credentials: List[Dict[str, Any]]) -> None:
    with maitento.Maitento(namespace=NAMESPACE) as mt:
        if mt.namespaces.find(NAMESPACE) is None:
            mt.namespaces.create(NAMESPACE)
        started = time.monotonic()
        response = mt.deploy(PROJECT)
        print(f"\n[live] deployed {NAMESPACE}: success={response.is_success} build={response.build_id} in {time.monotonic() - started:.1f}s")
        assert mt.interactions.get_by_name("hello").name == "hello"


def test_models_and_identity() -> None:
    with maitento.Maitento() as mt:
        names = [model.name for model in mt.models.list()]
        me = mt.users.self()
        access = mt.tenant.model_access()
    print(f"\n[live] {len(names)} models; caller roles {me.roles}; model access {access.model_dump()}")
    assert MODEL in names


def test_sync_run_streams_tokens(deployed: None, credentials: List[Dict[str, Any]]) -> None:
    tokens: List[str] = []
    started = time.monotonic()
    with maitento.Maitento(namespace=NAMESPACE) as mt:
        run = mt.interactions.run(
            "hello",
            inputs={"name": "Ada"},
            credentials=credentials,
            on_token=lambda text, agent: tokens.append(text),
            timeout=180,
        )
    elapsed = time.monotonic() - started
    print(f"\n[live/sync] run {run.id} {run.status} in {elapsed:.1f}s, {len(tokens)} token deltas")
    print(f"[live/sync] output: {run.output!r}")
    assert str(run.status) == "Finished"
    assert run.output and run.output.strip()
    assert tokens, "no token deltas arrived over the event socket"


async def test_async_run_streams_tokens(deployed: None, credentials: List[Dict[str, Any]]) -> None:
    tokens: List[str] = []
    updates: List[str] = []
    started = time.monotonic()
    async with maitento.AsyncMaitento(namespace=NAMESPACE) as mt:
        run = await mt.interactions.run(
            "hello",
            inputs={"name": "Grace"},
            credentials=credentials,
            on_token=lambda text, agent: tokens.append(text),
            on_update=lambda r: updates.append(str(r.status)),
            timeout=180,
        )
        transcript = mt.interaction_runs.transcript(run)
    elapsed = time.monotonic() - started
    print(f"\n[live/async] run {run.id} {run.status} in {elapsed:.1f}s, {len(tokens)} token deltas, states {updates}")
    print(f"[live/async] output: {run.output!r}; transcript kinds {[entry.kind for entry in transcript]}")
    assert str(run.status) == "Finished" and run.output and run.output.strip()
    assert tokens and updates[-1] == "Finished"


def test_runs_list_pages(deployed: None) -> None:
    with maitento.Maitento() as mt:
        page = mt.runs.list(types=["Interaction"], limit=2)
        walked = page.to_list(limit=5)
    print(f"\n[live] runs.list: first page {len(page.items)} (next cursor: {bool(page.next_cursor)}), walked {len(walked)}")
    assert len(page.items) <= 2
    assert len(walked) >= min(len(page.items), 2)
    if page.next_cursor:
        assert len(walked) > len(page.items)
