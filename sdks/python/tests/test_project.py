"""Reading a resource project exactly as `mt deploy` does, and deploying/validating it."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

import httpx
import pytest
import respx

import maitento
from factories import sample
from maitento._project import build_request, read_project

PROJECT: Dict[str, str] = {
    "agents/greeter.mtr": 'model = @ref("deepseek.deepseek-v4-flash")\nprompt = "Be kind."\nsummary = "Kind"\n',
    "agents/team/helper.mtr": 'model = @ref("x")\r\nprompt = "Help."\r\nsummary = "Helps"',
    "interactions/one-shot/hello.mtr": 'agent = { name = "Greeter" agent = @ref("greeter") }\ntask = "Hello"',
    "interactions/round-robin/chat.mtr": "agents = []",
    "interactions/managed/desk.mtr": "manager = {}",
    "interactions/notes.mtr": "ignored: not under a kind folder",
    "connectors/open-api/orders-get.mtr": "url = \"https://x\"",
    "external-operations/open-api/get-order.mtr": "connector = @ref(\"orders-get\")",
    "capsules/sandbox.mtr": "image = \"python\"",
    "looms/memory.mtr": "description = \"m\"",
    "prompts/task-hello.md": "# Say hello\n",
    "prompts/deep/task-bye.md": "Bye",
    "json/recipe.json": '{"type": "object"}',
    "apps/triage/triage.mtr": "description = \"t\"",
    "apps/triage/main.mtc": "main:\n  ret",
    "apps/triage/lib/util.mtc": "util:\n  ret",
    "apps/empty/readme.md": "no code",
    "code-pipelines/code-generator/pipeline-definition.json": '{"prompt": "@prompt(plan)", "schema": "@schema(verdict)", "op": "@externalOp(demo/get-order)"}',
    "code-pipelines/code-generator/prompts/plan.md": 'Plan the "work"\n',
    "code-pipelines/code-generator/verdict.schema.json": '{"type": "string"}',
    "code-pipeline-hooks/code-generator/hook.mtc": 'set x "@promptJson(code-generator/plan)"',
}


def test_build_request_layout() -> None:
    request = json.loads(json.dumps(maitento.to_wire(build_request(PROJECT, is_deploy=True))))
    assert request["isDeploy"] is True
    assert [(a["name"], a["filename"]) for a in request["agents"]] == [("greeter", "greeter.mtr"), ("helper", "team/helper.mtr")]
    assert request["agents"][1]["lines"] == ['model = @ref("x")', 'prompt = "Help."', 'summary = "Helps"']
    assert request["agents"][0]["lines"][-1] == ""  # a trailing newline keeps its empty last line, as mt sends it
    assert [i["name"] for i in request["interactions"]["oneShot"]] == ["hello"]
    assert [i["name"] for i in request["interactions"]["roundRobin"]] == ["chat"]
    assert [i["name"] for i in request["interactions"]["managed"]] == ["desk"]
    assert [i["name"] for i in request["connectors"]["openApi"]] == ["orders-get"]
    assert request["connectors"]["modelContextProtocol"] == []
    assert [i["name"] for i in request["externalOperations"]["openApi"]] == ["get-order"]
    assert [i["name"] for i in request["capsules"]] == ["sandbox"]
    assert [i["name"] for i in request["looms"]] == ["memory"]
    assert request["resourceFiles"]["prompts"] == [
        {"name": "task-bye", "content": "Bye"},
        {"name": "task-hello", "content": "# Say hello\n"},
    ]
    assert request["resourceFiles"]["json"] == [{"name": "recipe", "content": '{"type": "object"}'}]
    app = request["apps"][0]
    assert len(request["apps"]) == 1 and app["name"] == "triage"
    assert [c["filename"] for c in app["code"]] == ["lib/util.mtc", "main.mtc"]
    assert app["metadata"] == {"filename": "triage.mtr", "lines": ['description = "t"']}


def test_pipeline_includes_are_resolved() -> None:
    request = build_request(PROJECT, is_deploy=False)
    pipeline = request.code_pipelines[0]
    assert pipeline.name == "code-generator" and pipeline.filename == "code-pipelines/code-generator/pipeline-definition.json"
    definition = json.loads(pipeline.json_)
    assert definition == {"prompt": 'Plan the "work"\n', "schema": '{"type": "string"}', "op": "@externalOp(demo/get-order)"}


def test_hook_includes_are_escaped_for_cogniscript() -> None:
    request = build_request(PROJECT, is_deploy=False)
    hooks = request.code_pipeline_hooks
    assert hooks is not None
    line = hooks["code-generator"].code[0].lines[0]
    # JSON-escaped, a quote as " (as the C# SDK writes it), then every backslash doubled for the Cogniscript
    # assembler. A raw quote must never reach the literal: \\" would end it.
    assert line == r'set x "Plan the \\u0022work\\u0022\\n"'
    literal = line[len('set x "'):-1]
    assert '"' not in literal
    assert json.loads('"' + literal.replace("\\\\", "\\") + '"') == 'Plan the "work"\n'


def test_hook_schema_include_and_a_missing_asset() -> None:
    files = {
        "code-pipelines/gen/pipeline-definition.json": "{}",
        "code-pipelines/gen/verdict.schema.json": '{"type": "object", "required": ["ok"]}',
        "code-pipeline-hooks/gen/steps/inject.mtc": 'set schema "@schemaJson(gen/verdict)"',
    }
    hooks = build_request(files, is_deploy=True).code_pipeline_hooks
    assert hooks is not None and hooks["gen"].name == "gen"
    assert hooks["gen"].code[0].filename == "steps/inject.mtc"
    assert hooks["gen"].code[0].lines[0] == r'set schema "{\\u0022type\\u0022: \\u0022object\\u0022, \\u0022required\\u0022: [\\u0022ok\\u0022]}"'
    with pytest.raises(ValueError, match="reference not found"):
        build_request({**files, "code-pipeline-hooks/gen/steps/inject.mtc": "@schemaJson(gen/nope)"}, is_deploy=True)
    with pytest.raises(ValueError, match="<pipeline>/<asset>"):
        build_request({**files, "code-pipeline-hooks/gen/steps/inject.mtc": "@promptJson(verdict)"}, is_deploy=True)


def test_pipeline_schema_include_is_embedded_as_a_string() -> None:
    files = {
        "code-pipelines/gen/pipeline-definition.json": '{"steps": [{"outputSchema": "@schema(out)", "prompt": "@prompt(do)"}]}',
        "code-pipelines/gen/out.schema.json": '{\n  "type": "string"\n}',
        "code-pipelines/gen/prompts/do.md": "Do it.\n",
        "code-pipelines/other/prompts/notes.md": "no definition: skipped",
    }
    request = build_request(files, is_deploy=True)
    assert [p.name for p in request.code_pipelines] == ["gen"]
    step = json.loads(request.code_pipelines[0].json_)["steps"][0]
    assert step == {"outputSchema": '{\n  "type": "string"\n}', "prompt": "Do it.\n"}


def test_reading_a_folder_matches_the_mapping(tmp_path: Path) -> None:
    for relative, text in PROJECT.items():
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(text.encode("utf-8"))
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "x.json").write_text("{}")
    (tmp_path / "README.md").write_text("not a resource")
    files = read_project(tmp_path)
    assert files == PROJECT
    assert build_request(files, is_deploy=True) == build_request(PROJECT, is_deploy=True)


def test_utf8_bom_is_stripped(tmp_path: Path) -> None:
    (tmp_path / "agents").mkdir()
    (tmp_path / "agents" / "a.mtr").write_bytes("﻿model = 1".encode("utf-8"))
    assert read_project(tmp_path) == {"agents/a.mtr": "model = 1"}


def test_backslash_keys_are_normalised_and_traversal_rejected() -> None:
    request = build_request({"agents\\team\\a.mtr": "x"}, is_deploy=True)
    assert request.agents[0].filename == "team/a.mtr"
    with pytest.raises(ValueError, match="inside the project"):
        build_request({"../agents/a.mtr": "x"}, is_deploy=True)


def test_nothing_to_build() -> None:
    with pytest.raises(ValueError, match="Nothing to build"):
        build_request({"prompts/a.md": "x", "README.md": "x"}, is_deploy=True)


def test_missing_include_and_two_app_resources() -> None:
    with pytest.raises(ValueError, match="@prompt reference not found"):
        build_request({"code-pipelines/p/pipeline-definition.json": '{"a": "@prompt(nope)"}'}, is_deploy=True)
    with pytest.raises(ValueError, match="more than one .mtr"):
        build_request({"apps/a/a.mtr": "x", "apps/a/b.mtr": "y", "apps/a/main.mtc": "z"}, is_deploy=True)
    with pytest.raises(ValueError, match="single pipeline"):
        build_request({"code-pipeline-hooks/h/a.mtc": "@promptJson(../x)"}, is_deploy=True)


def build_response(success: bool) -> Dict[str, Any]:
    log = [] if success else [{"text": "Unknown agent 'gretter'", "date": "2026-10-26T10:00:00Z", "logLevel": "Error", "filename": "hello.mtr", "lineNumber": 3}]
    return {**sample("BuildResponse", isSuccess=success, isDeployed=success), "log": log}


def test_deploy_sends_the_project(mock: respx.MockRouter, client: maitento.Maitento, tmp_path: Path) -> None:
    (tmp_path / "agents").mkdir()
    (tmp_path / "agents" / "greeter.mtr").write_text("model = 1")
    route = mock.put("/namespaces/demo/build").mock(return_value=httpx.Response(200, json=build_response(True)))
    response = client.deploy(tmp_path)
    assert response.is_success
    sent = json.loads(route.calls.last.request.read())
    assert sent["isDeploy"] is True and sent["agents"][0]["name"] == "greeter"
    assert route.calls.last.request.extensions["timeout"]["read"] == 300.0
    other = mock.put("/namespaces/other/build").mock(return_value=httpx.Response(200, json=build_response(True)))
    client.validate({"agents/greeter.mtr": "model = 1"}, namespace="other")
    assert json.loads(other.calls.last.request.read())["isDeploy"] is False


def test_deploy_raises_on_compile_errors(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    mock.put("/namespaces/demo/build").mock(return_value=httpx.Response(200, json=build_response(False)))
    with pytest.raises(maitento.BuildFailedError) as caught:
        client.deploy({"agents/greeter.mtr": "model = 1"})
    assert "hello.mtr:3 Unknown agent 'gretter'" in str(caught.value)
    assert len(caught.value.errors) == 1
    response = client.deploy({"agents/greeter.mtr": "model = 1"}, throw_on_failure=False)
    assert not response.is_success
    assert not client.validate({"agents/greeter.mtr": "model = 1"}).is_success  # validate never raises


async def test_async_deploy(mock: respx.MockRouter, aclient: maitento.AsyncMaitento) -> None:
    route = mock.put("/namespaces/demo/build").mock(return_value=httpx.Response(200, json=build_response(True)))
    request = build_request({"agents/a.mtr": "x"}, is_deploy=False)
    response = await aclient.deploy(request)
    assert response.is_success
    assert json.loads(route.calls.last.request.read())["isDeploy"] is True
