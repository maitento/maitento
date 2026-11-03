"""Credentials and credential stacks: each call's verb, path and body, and what comes back."""

from __future__ import annotations

import datetime
import json
from typing import Any

import httpx
import pytest
import respx

import maitento
from factories import DATE, sample
from maitento import models

CREDENTIAL_ID = "3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7"
OTHER_CREDENTIAL_ID = "7c8d9e0f-1a2b-4c3d-9e4f-5a6b7c8d9e0f"
KEY_ID = "4f5a6b7c-8d9e-4f0a-b1c2-d3e4f5a6b7c8"
STACK_ID = "5a6b7c8d-9e0f-4a1b-8c2d-e3f4a5b6c7d8"
SIGN_IN_ID = "6b7c8d9e-0f1a-4b2c-9d3e-f4a5b6c7d8e9"
NAMESPACE_ID = "0f1e2d3c-4b5a-4968-8776-655443322110"


def body_of(route: respx.Route) -> Any:
    return json.loads(route.calls.last.request.read())


def credential(**overrides: Any) -> Any:
    fields = {"id": CREDENTIAL_ID, "name": "openai-production", "provider": "OpenAi"}
    fields["keys"] = [{"id": KEY_ID, "keyHint": "9xQz", "addedAtUtc": DATE}]
    return sample("ModelCredential", **{**fields, **overrides})


def stack(**overrides: Any) -> Any:
    return sample("CredentialStack", id=STACK_ID, name="production", **overrides)


# ======================================================================================================= credentials


def test_list_credentials_with_and_without_a_tag(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.get("/credentials").mock(return_value=httpx.Response(200, json=[credential()]))
    everything = client.credentials.list()
    assert "tag" not in route.calls.last.request.url.params
    tagged = client.credentials.list(tag="acme")
    assert route.calls.last.request.url.params["tag"] == "acme"
    assert isinstance(everything[0], models.ModelCredential) and tagged[0].id == CREDENTIAL_ID


def test_get_credential_serves_key_hints_never_secrets(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    mock.get(f"/credentials/by-id/{CREDENTIAL_ID}").mock(return_value=httpx.Response(200, json=credential()))
    found = client.credentials.get(CREDENTIAL_ID)
    assert found.provider == models.ModelKeyProvider.OPEN_AI
    assert found.keys[0].id == KEY_ID and found.keys[0].key_hint == "9xQz"
    assert "value" not in models.ModelCredentialKey.model_fields


def test_find_credential_is_none_when_missing(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    mock.get(f"/credentials/by-id/{CREDENTIAL_ID}").mock(return_value=httpx.Response(200, json=credential()))
    mock.get(f"/credentials/by-id/{OTHER_CREDENTIAL_ID}").mock(return_value=httpx.Response(404))
    found = client.credentials.find(CREDENTIAL_ID)
    assert found is not None and found.id == CREDENTIAL_ID
    assert client.credentials.find(OTHER_CREDENTIAL_ID) is None
    with pytest.raises(maitento.NotFoundError):
        client.credentials.get(OTHER_CREDENTIAL_ID)


def test_create_credential_from_keywords(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.post("/credentials").mock(return_value=httpx.Response(200, json=credential()))
    created = client.credentials.create(
        name="openai-production",
        provider="OpenAi",
        keys=[{"value": "sk-..."}],
        models=[{"model": "gpt-5", "deployment_name": "gpt-5-eu"}],
        tag="acme",
    )
    assert route.calls.last.request.method == "POST"
    assert body_of(route) == {
        "name": "openai-production",
        "provider": "OpenAi",
        "keys": [{"value": "sk-..."}],
        "models": [{"model": "gpt-5", "deploymentName": "gpt-5-eu"}],
        "tag": "acme",
    }
    assert created.id == CREDENTIAL_ID


def test_create_credential_from_a_request_model(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.post("/credentials").mock(return_value=httpx.Response(200, json=credential()))
    request = models.ModelCredentialRequest(
        name="foundry", provider=models.ModelKeyProvider.OPEN_AI, endpoint="https://acme.services.ai.azure.com", keys=[{"value": "sk-..."}]
    )
    client.credentials.create(request, description="The EU Foundry account")
    assert body_of(route) == {
        "name": "foundry",
        "provider": "OpenAi",
        "endpoint": "https://acme.services.ai.azure.com",
        "keys": [{"value": "sk-..."}],
        "description": "The EU Foundry account",
    }


def test_update_credential_keeps_a_key_by_id(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.put(f"/credentials/by-id/{CREDENTIAL_ID}").mock(return_value=httpx.Response(200, json=credential()))
    client.credentials.update(
        CREDENTIAL_ID, name="openai-production", provider="OpenAi", keys=[{"id": KEY_ID}, {"value": "sk-..."}], models=[]
    )
    assert body_of(route) == {
        "name": "openai-production",
        "provider": "OpenAi",
        "keys": [{"id": KEY_ID}, {"value": "sk-..."}],
        "models": [],
    }


def test_update_a_sign_in_credential_sends_no_keys(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.put(f"/credentials/by-id/{CREDENTIAL_ID}").mock(return_value=httpx.Response(200, json=credential(kind="OAuth")))
    client.credentials.update(CREDENTIAL_ID, name="claude-max", provider="Anthropic", tag="acme")
    assert body_of(route) == {"name": "claude-max", "provider": "Anthropic", "tag": "acme"}


def test_a_credential_keyword_typo_is_a_type_error(client: maitento.Maitento) -> None:
    with pytest.raises(TypeError, match="providr"):
        client.credentials.create(name="x", providr="OpenAi")


def test_delete_credential(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.delete(f"/credentials/by-id/{CREDENTIAL_ID}").mock(return_value=httpx.Response(204))
    assert client.credentials.delete(CREDENTIAL_ID) is None
    assert route.call_count == 1


def test_delete_by_tag_returns_how_many(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.delete("/credentials").mock(return_value=httpx.Response(200, json=3))
    deleted = client.credentials.delete_by_tag("acme")
    assert deleted == 3 and isinstance(deleted, int)
    assert route.calls.last.request.url.params["tag"] == "acme"
    assert route.calls.last.request.read() == b""


def test_test_credential_posts_no_body(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    result = sample("CredentialTestResult", credentialId=CREDENTIAL_ID, succeeded=False, errorCode="api:credentials:test-auth-failed")
    route = mock.post(f"/credentials/by-id/{CREDENTIAL_ID}/test").mock(return_value=httpx.Response(200, json=result))
    tested = client.credentials.test(CREDENTIAL_ID)
    assert route.calls.last.request.read() == b""
    assert tested.succeeded is False and tested.error_code == "api:credentials:test-auth-failed"


def test_test_unsaved_posts_the_create_body_and_stores_nothing(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    result = sample("CredentialTestResult", credentialId="00000000-0000-0000-0000-000000000000", succeeded=True)
    route = mock.post("/credentials/test").mock(return_value=httpx.Response(200, json=result))
    tested = client.credentials.test_unsaved(name="openai-production", provider="OpenAi", keys=[{"value": "sk-..."}])
    assert body_of(route) == {"name": "openai-production", "provider": "OpenAi", "keys": [{"value": "sk-..."}]}
    assert tested.succeeded is True


def test_stack_usage_says_where_it_is_used(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    usage = sample("CredentialStackUsage", credentialStackId=STACK_ID, tenantDefault=True,
                   namespaces=[{"id": NAMESPACE_ID, "name": "support"}], partitions=[])
    mock.get(f"/credential-stacks/by-id/{STACK_ID}/usage").mock(return_value=httpx.Response(200, json=usage))
    read = client.credential_stacks.usage(STACK_ID)
    assert isinstance(read, models.CredentialStackUsage)
    assert read.tenant_default is True and read.namespaces[0].name == "support"


def test_a_credential_test_is_not_retried(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.post(f"/credentials/by-id/{CREDENTIAL_ID}/test").mock(return_value=httpx.Response(429))
    with pytest.raises(maitento.RateLimitError):
        client.credentials.test(CREDENTIAL_ID)
    assert route.call_count == 1


def test_start_sign_in_for_a_new_or_an_existing_credential(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    started = sample("CredentialSignInStart", signInId=SIGN_IN_ID, tool="Codex", verificationUrl="https://example.com/device", userCode="ABCD-1234")
    codex = mock.post("/credentials/sign-in/codex").mock(return_value=httpx.Response(200, json=started))
    claude = mock.post("/credentials/sign-in/Claude").mock(return_value=httpx.Response(200, json={**started, "tool": "Claude"}))
    result = client.credentials.start_sign_in("codex")
    assert body_of(codex) == {}
    assert result.sign_in_id == SIGN_IN_ID and result.user_code == "ABCD-1234"
    client.credentials.start_sign_in(models.CredentialOAuthTool.CLAUDE, credential_id=CREDENTIAL_ID)
    assert body_of(claude) == {"credentialId": CREDENTIAL_ID}


def test_finish_sign_in_sends_the_code_and_reads_pending_or_complete(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.post("/credentials/sign-in/claude/finish").mock(
        side_effect=[
            httpx.Response(200, json={"status": "Pending", "credential": None}),
            httpx.Response(200, json={"status": "Complete", "credential": credential(kind="OAuth", keys=[])}),
        ]
    )
    pending = client.credentials.finish_sign_in("claude", sign_in_id=SIGN_IN_ID)
    assert body_of(route) == {"signInId": SIGN_IN_ID}
    assert pending.status == models.CredentialSignInStatus.PENDING and pending.credential is None
    done = client.credentials.finish_sign_in("claude", sign_in_id=SIGN_IN_ID, code="<the code Anthropic showed>", name="claude-max", tag="acme")
    assert body_of(route) == {"signInId": SIGN_IN_ID, "code": "<the code Anthropic showed>", "name": "claude-max", "tag": "acme"}
    assert done.status == models.CredentialSignInStatus.COMPLETE
    assert done.credential is not None and done.credential.kind == models.CredentialKind.O_AUTH


def test_finishing_a_sign_in_is_never_retried(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    # The code Anthropic shows works once, so a failed finish is left to the caller.
    route = mock.post("/credentials/sign-in/claude/finish").mock(return_value=httpx.Response(503))
    with pytest.raises(maitento.ApiError):
        client.credentials.finish_sign_in("claude", sign_in_id=SIGN_IN_ID, code="<the code Anthropic showed>")
    assert route.call_count == 1


EXPIRES = "2027-04-16T17:00:00+00:00"


def test_a_sign_ins_tokens_are_brought_then_replaced(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    created = mock.post("/credentials/sign-in-tokens").mock(return_value=httpx.Response(200, json=credential(kind="OAuth")))
    replaced = mock.put(f"/credentials/by-id/{CREDENTIAL_ID}/sign-in-tokens").mock(return_value=httpx.Response(200, json=credential(kind="OAuth")))
    expires = datetime.datetime(2027, 4, 16, 17, tzinfo=datetime.timezone.utc)
    saved = client.credentials.import_sign_in(tool="Claude", access_token="at-...", refresh_token="rt-...", expires_at_utc=expires,
                                              subscription_type="max", name="acme-claude-max", tag="acme")
    client.credentials.replace_sign_in_tokens(CREDENTIAL_ID, tool="Codex", access_token="at-2", refresh_token="rt-2", id_token="id-2",
                                              expires_at_utc=expires)

    assert saved.id == CREDENTIAL_ID
    sent = body_of(created)
    assert sent["tool"] == "Claude" and sent["accessToken"] == "at-..." and sent["refreshToken"] == "rt-..."
    assert sent["subscriptionType"] == "max" and sent["name"] == "acme-claude-max" and sent["tag"] == "acme"
    assert sent["expiresAtUtc"].startswith("2027-04-16T17:00:00")
    assert body_of(replaced)["idToken"] == "id-2"


def test_bringing_a_sign_in_is_never_retried_but_replacing_its_tokens_is(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    created = mock.post("/credentials/sign-in-tokens").mock(return_value=httpx.Response(503))
    replaced = mock.put(f"/credentials/by-id/{CREDENTIAL_ID}/sign-in-tokens").mock(
        side_effect=[httpx.Response(503), httpx.Response(200, json=credential(kind="OAuth"))]
    )
    with pytest.raises(maitento.ApiError):
        client.credentials.import_sign_in(tool="Claude", access_token="at", refresh_token="rt", expires_at_utc=EXPIRES)
    client.credentials.replace_sign_in_tokens(CREDENTIAL_ID, tool="Claude", access_token="at", refresh_token="rt", expires_at_utc=EXPIRES)
    assert created.call_count == 1 and replaced.call_count == 2


# ================================================================================================== credential stacks


def test_list_and_get_stacks(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    mock.get("/credential-stacks").mock(return_value=httpx.Response(200, json=[stack()]))
    mock.get(f"/credential-stacks/by-id/{STACK_ID}").mock(return_value=httpx.Response(200, json=stack(version=4)))
    assert [s.name for s in client.credential_stacks.list()] == ["production"]
    found = client.credential_stacks.get(STACK_ID)
    assert isinstance(found, models.CredentialStack) and found.version == 4


def test_find_stack_is_none_when_missing(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    mock.get(f"/credential-stacks/by-id/{STACK_ID}").mock(return_value=httpx.Response(200, json=stack()))
    mock.get(f"/credential-stacks/by-id/{CREDENTIAL_ID}").mock(return_value=httpx.Response(404))
    found = client.credential_stacks.find(STACK_ID)
    assert found is not None and found.name == "production"
    assert client.credential_stacks.find(CREDENTIAL_ID) is None


def test_find_stack_by_name(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    mock.get("/credential-stacks/by-name/production").mock(return_value=httpx.Response(200, json=stack()))
    mock.get("/credential-stacks/by-name/nobody").mock(return_value=httpx.Response(404))
    found = client.credential_stacks.find_by_name("production")
    assert found is not None and found.id == STACK_ID
    assert client.credential_stacks.find_by_name("nobody") is None


def test_create_stack_keeps_the_entry_order(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.post("/credential-stacks").mock(return_value=httpx.Response(200, json=stack()))
    client.credential_stacks.create(
        name="production",
        entries=[
            {"credential_id": CREDENTIAL_ID, "allowed_endpoint_kinds": ["Foundry"]},
            {"credentialId": OTHER_CREDENTIAL_ID, "allowedModels": ["gpt-5-mini"], "enabled": False},
        ],
    )
    assert body_of(route) == {
        "name": "production",
        "entries": [
            {"credentialId": CREDENTIAL_ID, "allowedEndpointKinds": ["Foundry"]},
            {"credentialId": OTHER_CREDENTIAL_ID, "allowedModels": ["gpt-5-mini"], "enabled": False},
        ],
    }


def test_update_and_delete_stack(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    update = mock.put(f"/credential-stacks/by-id/{STACK_ID}").mock(return_value=httpx.Response(200, json=stack(version=2)))
    delete = mock.delete(f"/credential-stacks/by-id/{STACK_ID}").mock(return_value=httpx.Response(204))
    updated = client.credential_stacks.update(STACK_ID, {"name": "production", "description": "EU only"}, entries=[{"credentialId": CREDENTIAL_ID}])
    assert body_of(update) == {"name": "production", "description": "EU only", "entries": [{"credentialId": CREDENTIAL_ID}]}
    assert updated.version == 2
    assert client.credential_stacks.delete(STACK_ID) is None and delete.call_count == 1


def test_deleting_a_default_stack_is_refused_with_its_code(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    failure = {"errorCode": "api:credential-stacks:in-use-as-default", "memberName": "id", "message": "It's a default."}
    mock.delete(f"/credential-stacks/by-id/{STACK_ID}").mock(return_value=httpx.Response(400, json={"validationFailures": [failure]}))
    with pytest.raises(maitento.ValidationError) as caught:
        client.credential_stacks.delete(STACK_ID)
    assert caught.value.code == "api:credential-stacks:in-use-as-default"


def test_tenant_default_stack(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    mock.get("/tenants/self/default-credential-stack").mock(return_value=httpx.Response(200, json={"credentialStackId": None}))
    route = mock.put("/tenants/self/default-credential-stack").mock(
        side_effect=lambda request: httpx.Response(200, json=json.loads(request.read()))
    )
    assert client.credential_stacks.get_tenant_default().credential_stack_id is None
    assert client.credential_stacks.set_tenant_default(STACK_ID).credential_stack_id == STACK_ID
    assert body_of(route) == {"credentialStackId": STACK_ID}
    cleared = client.credential_stacks.set_tenant_default(None)
    assert body_of(route) == {"credentialStackId": None} and cleared.credential_stack_id is None


def test_setting_a_default_is_retried(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.put("/tenants/self/default-credential-stack").mock(
        side_effect=[httpx.Response(503), httpx.Response(200, json={"credentialStackId": STACK_ID})]
    )
    client.credential_stacks.set_tenant_default(STACK_ID)
    assert route.call_count == 2


def test_namespace_default_stack(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    url = f"/namespaces/by-id/{NAMESPACE_ID}/default-credential-stack"
    read = mock.get(url).mock(return_value=httpx.Response(200, json={"credentialStackId": STACK_ID}))
    write = mock.put(url).mock(return_value=httpx.Response(200, json={"credentialStackId": None}))
    assert client.credential_stacks.get_namespace_default(NAMESPACE_ID).credential_stack_id == STACK_ID
    assert client.credential_stacks.set_namespace_default(NAMESPACE_ID, None).credential_stack_id is None
    assert read.call_count == 1 and body_of(write) == {"credentialStackId": None}


PARTITION_ID = "4b5c6d7e-8f9a-4b0c-9d1e-2f3a4b5c6d7e"


def test_a_partitions_embedding_stack_is_set_by_id_and_cleared_with_none(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.put(f"/partitions/by-id/{PARTITION_ID}/embedding-credential-stack").mock(
        side_effect=lambda request: httpx.Response(200, json=sample(
            "Partition", id=PARTITION_ID, name="handbook", embeddingCredentialStackId=json.loads(request.read())["credentialStackId"]))
    )
    assert client.partitions.set_embedding_credential_stack(PARTITION_ID, STACK_ID).embedding_credential_stack_id == STACK_ID
    assert body_of(route) == {"credentialStackId": STACK_ID}
    cleared = client.partitions.set_embedding_credential_stack(PARTITION_ID, None)
    assert body_of(route) == {"credentialStackId": None} and cleared.embedding_credential_stack_id is None


def test_an_automation_action_names_the_stack_its_runs_use(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.post("/namespaces/demo/automated-actions").mock(return_value=httpx.Response(200, json=sample("AutomatedAction")))
    action = models.AutomatedActionItemInput(
        config=models.AppProcessStartConfigInput(version={"id": PARTITION_ID, "version": 1}, inputs=[], credential_stack="customer-acme")
    )
    client.automations.create(name="nightly", actions=[action])
    config = body_of(route)["actions"][0]["config"]
    assert config["$type"] == "app" and config["credentialStack"] == "customer-acme"


def test_deleting_a_stack_a_partition_embeds_with_is_refused_with_its_code(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    failure = {"errorCode": "api:credential-stacks:in-use-by-partition", "memberName": "id", "message": "Partition 'handbook' embeds with it."}
    mock.delete(f"/credential-stacks/by-id/{STACK_ID}").mock(return_value=httpx.Response(400, json={"validationFailures": [failure]}))
    with pytest.raises(maitento.ValidationError) as caught:
        client.credential_stacks.delete(STACK_ID)
    assert caught.value.code == "api:credential-stacks:in-use-by-partition"


async def test_the_async_client_has_the_same_calls(mock: respx.MockRouter, aclient: maitento.AsyncMaitento) -> None:
    mock.delete("/credentials").mock(return_value=httpx.Response(200, json=2))
    mock.get(f"/credentials/by-id/{CREDENTIAL_ID}").mock(return_value=httpx.Response(404))
    mock.get(f"/credential-stacks/by-id/{STACK_ID}").mock(return_value=httpx.Response(200, json=stack()))
    route = mock.put(f"/namespaces/by-id/{NAMESPACE_ID}/default-credential-stack").mock(
        return_value=httpx.Response(200, json={"credentialStackId": None})
    )
    assert await aclient.credentials.delete_by_tag("acme") == 2
    assert await aclient.credentials.find(CREDENTIAL_ID) is None
    found = await aclient.credential_stacks.find(STACK_ID)
    assert found is not None and found.id == STACK_ID
    cleared = await aclient.credential_stacks.set_namespace_default(NAMESPACE_ID, None)
    assert cleared.credential_stack_id is None and body_of(route) == {"credentialStackId": None}
