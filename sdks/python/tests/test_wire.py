"""Wire formats the SDK converts: TimeSpans, 7-digit dates, discriminators, enums, plain text, request bodies."""

from __future__ import annotations

import datetime as dt
import json

import httpx
import pydantic
import pytest
import respx

import maitento
from factories import sample
from maitento import models


def body_of(route: respx.Route) -> object:
    return json.loads(route.calls.last.request.read())


def test_timespans_are_sent_in_dotnet_form(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.post("/capsule-processes/by-id/r1/commands").mock(return_value=httpx.Response(200, json=sample("CapsuleProcessCommand")))
    client.capsule_runs.exec("r1", "make", ["test"], maximum_duration=dt.timedelta(minutes=5), async_=True)
    assert body_of(route) == {"command": "make", "arguments": ["test"], "maximumDuration": "00:05:00", "async": True}


def test_timespans_and_seven_digit_dates_are_parsed(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    body = sample("InteractionProcess", executionTime="1.02:03:04.5000000", dateCreated="2026-10-26T10:15:30.1234567Z")
    mock.get("/interactions/processes/by-id/r1").mock(return_value=httpx.Response(200, json=body))
    run = client.interaction_runs.get("r1")
    assert run.execution_time == dt.timedelta(days=1, hours=2, minutes=3, seconds=4, microseconds=500000)
    assert run.date_created == dt.datetime(2026, 10, 26, 10, 15, 30, 123456, tzinfo=dt.timezone.utc)


def test_timespan_helpers_round_trip() -> None:
    for text in ("00:05:00", "-00:00:01", "1.00:00:01.5000000", "12:34:56.0000010"):
        assert models.format_dotnet_timespan(models.parse_dotnet_timespan(text)) == text
    with pytest.raises(ValueError):
        models.parse_dotnet_timespan("PT5M")


def test_polymorphic_responses_pick_their_type(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    one_shot = sample("OneShotInteraction")
    unknown = {**sample("OneShotInteraction"), "$type": "something-new", "brandNewField": 1}
    mock.get("/interactions").mock(return_value=httpx.Response(200, json=[one_shot, unknown]))
    items = client.interactions.list()
    assert isinstance(items[0], models.OneShotInteraction)
    assert isinstance(items[1], models.UnknownWireModel)
    assert items[1].model_extra is not None and items[1].model_extra["brandNewField"] == 1


def test_discriminator_is_sent_first(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.put("/code-pipelines/processes/by-id/r1/credentials").mock(return_value=httpx.Response(204))
    client.pipeline_runs.update_credentials("r1", [{"engine": "Codex", "apiKey": "sk-1", "type": "apiKey"}])
    raw = route.calls.last.request.read().decode()
    assert raw.startswith('[{"type":"apiKey"') or raw.startswith('[{"type": "apiKey"')
    assert json.loads(raw) == [{"type": "apiKey", "engine": "Codex", "apiKey": "sk-1"}]


def test_dollar_type_first_in_nested_unions(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.post("/namespaces/demo/automated-actions").mock(return_value=httpx.Response(200, json=sample("AutomatedAction")))
    client.automations.create(name="nightly", actions=[{"config": {"inputs": [], "$type": "interaction"}}])
    sent = body_of(route)
    assert isinstance(sent, dict)
    config = sent["actions"][0]["config"]
    assert list(config)[0] == "$type" and config["inputs"] == []


def test_unknown_enum_values_are_kept_as_strings(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    mock.get("/interactions/processes/by-id/r1").mock(
        return_value=httpx.Response(200, json=sample("InteractionProcess", status="Hibernating"))
    )
    run = client.interaction_runs.get("r1")
    assert run.status == "Hibernating" and str(run.status) == "Hibernating"
    assert models.InteractionProcessStatus("running") is models.InteractionProcessStatus.RUNNING


def test_unknown_fields_are_kept(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    mock.get("/namespaces/by-name/demo").mock(return_value=httpx.Response(200, json={**sample("Namespace"), "shinyNew": [1, 2]}))
    namespace = client.namespaces.get("demo")
    assert namespace.model_extra == {"shinyNew": [1, 2]}


def test_plain_text_is_decided_by_content_type(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.get("/namespaces/demo/vfs/by-name/notes/files/contents/text").mock(
        return_value=httpx.Response(200, text='"starts with a quote"', headers={"Content-Type": "text/plain; charset=utf-8"})
    )
    assert client.vfs.open("notes").read_text("/quoted.txt") == '"starts with a quote"'
    assert route.calls.last.request.headers["Accept"] == "text/plain"


def test_secrets_are_write_only(client: maitento.Maitento) -> None:
    from maitento._async._resources import AsyncSecrets

    assert not hasattr(client.secrets, "value")
    assert not hasattr(AsyncSecrets, "value")


def test_vfs_text_from_either_content_type(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.get("/namespaces/demo/vfs/by-name/notes/files/contents/text").mock(
        side_effect=[
            httpx.Response(200, text="# Today\n", headers={"Content-Type": "text/plain"}),
            httpx.Response(200, json="# Today\n"),
        ]
    )
    notes = client.vfs.open("notes")
    assert notes.read_text("/today.md") == "# Today\n"
    assert notes.read_text("/today.md") == "# Today\n"
    assert route.calls.last.request.url.params["path"] == "/today.md"


def test_bytes_are_base64_on_the_wire(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    write = mock.put("/vfs/by-id/v1/files/write/bytes").mock(return_value=httpx.Response(200, json=sample("FileSystemFile")))
    read = mock.get("/vfs/by-id/v1/files/contents/bytes").mock(
        return_value=httpx.Response(200, content=b"\x00\x01", headers={"Content-Type": "application/octet-stream"})
    )
    handle = client.vfs.open_by_id("v1")
    handle.write_bytes("/a.bin", b"\x00\x01")
    assert body_of(write) == {"content": "AAE="}
    assert handle.read_bytes("/a.bin") == b"\x00\x01"
    assert read.calls.last.request.headers["Accept"] == "*/*"


def test_start_inputs_from_a_mapping(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.put("/namespaces/demo/interactions/by-name/haiku/start").mock(
        return_value=httpx.Response(200, json=sample("InteractionProcess", status="New"))
    )
    client.interactions.start("haiku", inputs={"topic": "autumn", "count": 3, "rhymes": False})
    assert body_of(route) == {
        "inputs": [
            {"name": "topic", "value": "autumn"},
            {"name": "count", "value": "3"},
            {"name": "rhymes", "value": "false"},
        ]
    }


def test_start_inputs_leave_out_none(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    # An optional input with no value is not sent at all, never as the text "None" (as TypeScript drops null).
    route = mock.put("/namespaces/demo/interactions/by-name/support/start").mock(
        return_value=httpx.Response(200, json=sample("InteractionProcess", status="New"))
    )
    client.interactions.start("support", inputs={"ticket": "My grinder snapped", "orderId": None})
    assert body_of(route) == {"inputs": [{"name": "ticket", "value": "My grinder snapped"}]}


def test_start_without_inputs_sends_an_empty_list(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.put("/namespaces/demo/interactions/by-name/hello/start").mock(
        return_value=httpx.Response(200, json=sample("InteractionProcess", status="New"))
    )
    client.interactions.start("hello", credentials=[{"provider": "DeepSeek", "apiKey": "k", "priority": 0}])
    assert body_of(route) == {"inputs": [], "credentials": [{"provider": "DeepSeek", "apiKey": "k", "priority": 0}]}


def test_requests_accept_models_mappings_and_keywords(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.post("/namespaces/demo/agents").mock(return_value=httpx.Response(200, json=sample("Agent")))
    model = models.AgentCreateRequest(
        name="greeter", aiModelId="m1", systemPrompt="Be kind.", summaryForOtherAgents="Kind"
    )
    client.agents.create(model)
    first = body_of(route)
    client.agents.create({"name": "greeter", "aiModelId": "m1", "system_prompt": "Be kind.", "summaryForOtherAgents": "Kind"})
    second = body_of(route)
    client.agents.create(model, system_prompt="Be terse.")
    third = body_of(route)
    assert first == second == {"name": "greeter", "aiModelId": "m1", "systemPrompt": "Be kind.", "summaryForOtherAgents": "Kind"}
    assert isinstance(third, dict) and third["systemPrompt"] == "Be terse."


def test_a_keyword_typo_is_a_type_error(client: maitento.Maitento) -> None:
    with pytest.raises(TypeError, match="sytem_prompt"):
        client.agents.create(name="greeter", sytem_prompt="x")


def test_a_missing_required_field_fails_before_sending(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.post("/namespaces/demo/agents")
    with pytest.raises(pydantic.ValidationError):
        client.agents.create(name="greeter")
    assert route.call_count == 0


def test_required_collections_default_to_empty(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.post("/namespaces/demo/interactions/one-shot").mock(return_value=httpx.Response(200, json=sample("OneShotInteraction")))
    client.interactions.create_one_shot(
        name="hello",
        prompt="Say hello.",
        system_prompt_mode="AppendToDefault",
        agent={"name": "Greeter", "agent": {"id": "a1", "version": 1}},
    )
    sent = body_of(route)
    assert isinstance(sent, dict)
    assert sent["systemPrompts"] == [] and sent["inputsPrompt"] == []
    # The binding's lists are optional in its request shape (InteractionAgentBindingInput), so nothing is added there.
    assert sent["agent"] == {"name": "Greeter", "agent": {"id": "a1", "version": 1}}


def test_required_collections_are_filled_at_every_level() -> None:
    from typing import Dict, List, Optional

    from maitento._http import build_model

    class Leaf(models.WireModel):
        tags: List[str]
        notes: Optional[List[str]] = None

    class Root(models.WireModel):
        name: str
        leaves: List[Leaf]
        lookup: Dict[str, str]
        leaf: Optional[Leaf] = None

    built = build_model(Root, {"name": "r", "leaves": [{}], "leaf": {}}, {})
    assert models.to_wire(built) == {"name": "r", "leaves": [{"tags": []}], "lookup": {}, "leaf": {"tags": []}}


def test_http_method_given_as_a_string(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.post("/namespaces/demo/connectors/open-api").mock(return_value=httpx.Response(200, json=sample("OpenApiConnector")))
    client.connectors.create_open_api(name="orders", url="https://x/orders", description="d", authentication_type="None", http_method="POST")
    sent = body_of(route)
    assert isinstance(sent, dict) and sent["httpMethod"] == {"method": "POST"}


def test_path_segments_are_encoded(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.get(url__regex=r".*/patterns/by-name/.*").mock(return_value=httpx.Response(200, json=sample("LoomPattern")))
    client.looms.pattern("l1", "acme/app")
    assert route.calls.last.request.url.raw_path.endswith(b"/patterns/by-name/acme%2Fapp")


def test_query_lists_repeat_and_csv(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.get("/processes").mock(return_value=httpx.Response(200, json={"items": [], "nextCursor": None}))
    after = dt.datetime(2026, 10, 1, 12, 0, tzinfo=dt.timezone(dt.timedelta(hours=2)))
    client.runs.list(ids=["a", "b"], types=["App", "Interaction"], namespace=["n1", "n2"], retained=True, created_after=after)
    params = route.calls.last.request.url.params
    assert params["ids"] == "a,b" and params["types"] == "App,Interaction"
    assert params.get_list("namespace") == ["n1", "n2"]
    assert params["retained"] == "true" and params["createdAfter"] == "2026-10-01T10:00:00Z"


def test_namespace_is_required_for_by_name_calls() -> None:
    with maitento.Maitento("u:s", base_url="http://mt.test", environ={}) as mt:
        with pytest.raises(maitento.ConfigurationError, match="namespace"):
            mt.interactions.start("hello")


def test_transcript_orders_every_kind_by_sequence() -> None:
    def item(kind: str, sequence: int, **fields: object) -> dict:
        return {**sample(f"InteractionProcessContext{kind}"), "sequence": sequence, **fields}

    context = sample("InteractionProcessContext")
    context["agentMessage"] = [item("AgentMessage", 3, message="Hi Ada"), item("AgentMessage", 1, message="Thinking")]
    context["humanMessage"] = [item("HumanMessage", 2, message="Hello")]
    run = models.InteractionProcess.model_validate(sample("InteractionProcess", context=context))
    entries = maitento.transcript(run)
    assert [(e.kind, e.sequence, e.text) for e in entries] == [
        ("agent_message", 1, "Thinking"),
        ("human_message", 2, "Hello"),
        ("agent_message", 3, "Hi Ada"),
    ]


def test_start_by_name_or_by_id(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    app = sample("AppProcess", status="New")
    by_id = mock.put("/apps/by-id/a1/versions/3/start").mock(return_value=httpx.Response(200, json=app))
    by_name = mock.put("/namespaces/demo/apps/by-name/triage/versions/latest/start").mock(
        return_value=httpx.Response(200, json=app)
    )
    client.apps.start(id="a1", version=3, inputs={"ticket": "T-1"})
    client.apps.start("triage")
    assert by_id.call_count == 1 and by_name.call_count == 1
    assert body_of(by_id) == {"inputs": [{"name": "ticket", "value": "T-1"}]}
    interaction = mock.put("/interactions/processes/by-id/i1/start").mock(
        return_value=httpx.Response(200, json=sample("InteractionProcess", status="New"))
    )
    client.interactions.start(id="i1")
    assert interaction.call_count == 1
    with pytest.raises(ValueError, match="version="):
        client.apps.start(id="a1")
    with pytest.raises(ValueError, match="version="):
        client.capsules.start("box", version=2)
    with pytest.raises(ValueError, match="not both"):
        client.pipelines.start("gen", id="p1")
    with pytest.raises(ValueError, match="not both"):
        client.interactions.start()
