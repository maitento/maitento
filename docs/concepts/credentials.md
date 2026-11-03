---
title: Credentials and credential stacks
description: Your own access to model providers, the stacks that order it, and choosing a stack for each run.
sidebar:
  order: 2.5
---

# Credentials and credential stacks

A **credential** is your access to one model provider: the provider, one or more API keys, and optionally the models
it may serve and the endpoint to call. A **credential stack** is an ordered list of your credentials. A run uses a
stack, and every model call it makes is served by that stack's credentials, in order. **A run on a stack never uses
Maitento's own keys.**

Stacks let one tenant run work on different accounts: your own production keys by default, and each of your customers'
keys for that customer's runs. [Tutorial 24](../tutorials/24-customer-credentials.md) sets that up.

## Add a credential

Only tenant admins can add, change or remove credentials. Everyone in the tenant can list them.

<!-- tabs -->
```ts
const credential = await mt.credentials.create({ name: "DeepSeek production", provider: "DeepSeek", keys: [{ value: process.env.DEEPSEEK_API_KEY! }] });
```
```python
credential = mt.credentials.create(name="DeepSeek production", provider="DeepSeek", keys=[{"value": os.environ["DEEPSEEK_API_KEY"]}])
```
```csharp
var credential = await mt.Credentials.CreateAsync(new ModelCredentialRequest { Name = "DeepSeek production", Provider = ModelKeyProvider.DeepSeek, Keys = [new() { Value = Environment.GetEnvironmentVariable("DEEPSEEK_API_KEY") }] });
```
```bash title="curl"
curl -X POST https://api.maitento.com/credentials \
  -H "Authorization: $MAITENTO_AUTH" \
  -H "Content-Type: application/json" \
  -d '{"name": "DeepSeek production", "provider": "DeepSeek", "keys": [{"value": "sk-..."}]}'
```
<!-- /tabs -->

| Field | What it is |
|---|---|
| `name` | Unique in your tenant. |
| `provider` | `OpenAi`, `Anthropic`, `DeepSeek`, `Gemini`, `Qwen`, `Glm` or `Kimi`. |
| `keys` | One or more API keys, tried in order. Write-only: Maitento shows only the last four characters (`keyHint`). |
| `models` | The models it may serve, each with an optional `deploymentName` (what your endpoint calls the model) and `contextWindowTokens`. Leave it empty for any of the provider's models. |
| `endpoint` | Where to send the calls: an Azure OpenAI or Azure AI Foundry endpoint, or your own. Leave it out for the provider's public API. |
| `cloud` | For an Anthropic credential, Claude on Amazon Bedrock (`{"kind": "Bedrock", "awsRegion": "us-east-1"}`, with a Bedrock API key as the key) or Google Vertex AI (`{"kind": "Vertex", "gcpProjectId", "gcpRegion"}`, with the service account's JSON key file, pasted whole, as the key). Only code pipelines' Claude Code agents run on it, and it can't be [tested](#test-a-credential) (`api:credentials:test-not-supported`). |
| `tag` | A label, such as a customer's id. You can list credentials by tag, and delete every credential with a tag in one call. |

Things to know about credentials:

- **Keys are matched by id when you update one.** Send a key's `id` without a `value` to keep it, a `value` to
  replace it (the replacement is a new key, with a new id), and leave a key out to remove it.
- **An endpoint must be `https` on the public internet.** A loopback, private or internal address is refused when you
  save it (`api:credentials:endpoint-not-public`). A name that later resolves to one is refused each time a call
  would be made, so the call moves on to the next credential.
- **Your plan limits how many credentials and stacks you can hold** (`api:credentials:limit-reached`,
  `api:credential-stacks:limit-reached`).
- **Deleting a credential takes it out of every stack** that held it.

## Put credentials in a stack

A stack lists your credentials in the order a run tries them. Each entry can narrow what its credential serves:

| Entry field | What it does |
|---|---|
| `credentialId` | The credential. It must be one of your tenant's. |
| `allowedModels` | Only these models, for this entry. Leave it out for every model the credential serves. |
| `allowedEndpointKinds` | Only credentials whose endpoint is one of these kinds: `Public`, `AzureOpenAi`, `Foundry`, `Custom`, `Bedrock` or `Vertex`. |
| `enabled` | `false` skips the entry without removing it. |

<!-- tabs -->
```ts
const stack = await mt.credentialStacks.create({ name: "Production", entries: [{ credentialId: credential.id }] });
```
```python
stack = mt.credential_stacks.create(name="Production", entries=[{"credential_id": credential.id}])
```
```csharp
var stack = await mt.CredentialStacks.CreateAsync(new CredentialStackRequest { Name = "Production", Entries = [new() { CredentialId = credential.Id }] });
```
```bash title="curl"
curl -X POST https://api.maitento.com/credential-stacks \
  -H "Authorization: $MAITENTO_AUTH" \
  -H "Content-Type: application/json" \
  -d '{"name": "Production", "entries": [{"credentialId": "<your credential id>"}]}'
```
<!-- /tabs -->

A stack's name is unique in your tenant, so you can read it back by name as well as by id
(`GET /credential-stacks/by-name/{name}`, `findByName`).

For each model call, the entries are tried in order. An entry is skipped when it's switched off, when its credential
is for another provider or doesn't serve the model, or when the credential is
[switched off for failing](#when-a-credential-keeps-failing). Inside a credential, its keys are tried in order. A call
moves on to the next key or entry when one is refused, out of quota, rate-limited or can't be reached.

### Models on your own endpoint

A model that isn't in the catalogue runs only on a credential that hosts it: one with its own `endpoint` (kind
`Custom`), for the API the model speaks, that names the model in its `models`. That covers a model an agent override
defines inline (`customModel`, whose `apiType` is `OpenAi` or `Anthropic`), and the coding agents that run on your own
endpoint (`CustomAnthropic`, `CustomOpenAiResponses`, `CustomOpenAiChat`). A credential for the provider's public API,
or one that serves "any model", is never sent a model it doesn't host.

```json
{
  "name": "acme-coder",
  "provider": "OpenAi",
  "endpoint": "https://llm.acme.example/v1",
  "keys": [{ "value": "sk-..." }],
  "models": [{ "model": "acme-coder-32b", "contextWindowTokens": 128000 }]
}
```

## Which stack a run uses

A run uses the first stack it finds, in this order:

1. the stack named when it starts (`credentialStack`, the stack's id or name);
2. the stack of the run that started it, when that run had a stack chosen for it;
3. the stack its definition names (`credentialStack` in the interaction's or app's `.mtr` file, or in
   `pipeline-definition.json`);
4. its namespace's default stack;
5. your tenant's default stack.

A stack named at the start or in a definition must exist, or the run is refused (`api:credential-stacks:unknown`).
A run with no stack at any level runs on your [model keys](models-and-keys.md), as before.

Set the defaults:

<!-- tabs -->
```ts
await mt.credentialStacks.setTenantDefault(stack.id);
```
```python
mt.credential_stacks.set_tenant_default(stack.id)
```
```csharp
await mt.CredentialStacks.SetTenantDefaultAsync(stack.Id);
```
```bash
mt credential-stack-default --set <your stack id>
```
```bash title="curl"
curl -X PUT https://api.maitento.com/tenants/self/default-credential-stack \
  -H "Authorization: $MAITENTO_AUTH" \
  -H "Content-Type: application/json" \
  -d '{"credentialStackId": "<your stack id>"}'
```
<!-- /tabs -->

A namespace's default works the same way (`setNamespaceDefault`). Pass a null id to clear a default. A stack can't be
deleted while it's a default (`api:credential-stacks:in-use-as-default`).

Choose a stack for one run in its start request:

```json
{ "inputs": [], "credentialStack": "Customer 42" }
```

An app's stack is the stack of every interaction and code pipeline it starts. An [automation](automations.md)'s
action can name a stack for the runs it starts in the same way. A run can't be given a stack and keys of its own at
once (`api:credential-stacks:with-credentials`).

### What a run records

A run keeps the stack as it was when it started, in its `credentialStack`: the stack's id, name and version, where it
came from (`source`: `Start`, `Parent`, `Definition`, `Namespace` or `Tenant`), and its entries with their rules. It
never holds a key. Editing the stack afterwards doesn't change a run already going, and every usage record says which
credential served the call (`credential:<credential id>/<key id>`).

A code pipeline run you resume with a prompt can carry on with a stack as it is now, for example after you've added a
key or moved a failing one down. Name the stack in the resume request
(`PUT /code-pipelines/processes/by-id/{id}/resume-with-prompt`):

```json
{ "continuationPrompt": "Carry on from the step that failed.", "credentialStack": "Customer 42" }
```

The run records the stack again, as it is at the resume, in place of the stack or keys it had. Sending `credentials`
instead takes the run off its stack and onto those keys. A resume can't have both
(`api:credential-stacks:with-credentials`), and a stack that doesn't exist refuses it, as at a start.

## Keep credentials and stacks in a file

To set up the same credentials and stacks from a deploy script, describe them in a JSON file and apply it with the
`mt` command line. Each key names the environment variable that holds it, so the file holds no secret and can live in
source control:

```json title="credentials.json"
{
  "credentials": [
    {
      "name": "production-openai",
      "provider": "OpenAi",
      "keys": [{ "fromEnv": "OPENAI_API_KEY" }],
      "tag": "production"
    }
  ],
  "stacks": [
    { "name": "Production", "entries": [{ "credential": "production-openai" }] }
  ]
}
```

```bash
mt credential-apply --file credentials.json --dry-run   # what would change
mt credential-apply --file credentials.json
```

Credentials and stacks are matched by name: one the file names is created, or updated to what the file says, and
anything the file leaves out is left alone. Every variable is checked before anything is written, and a key written into
the file is refused. Running it again with the same keys changes nothing: a credential keeps its keys' ids, and so its
[health](#when-a-credential-keeps-failing). A stack entry can name a credential in the file or one you already have.

## Work that isn't a run

Some work isn't started as a run, so no start request can name a stack for it: indexing and searching a
[knowledge base](knowledge.md), recall from [memory](memory.md), and describing images. It uses your tenant's default
stack when you have one, and your model keys when you don't.

A knowledge base can name a stack of its own instead:

<!-- tabs -->
```ts
await mt.partitions.setEmbeddingCredentialStack(handbook.id, stack.id);
```
```python
mt.partitions.set_embedding_credential_stack(handbook.id, stack.id)
```
```csharp
await mt.Partitions.SetEmbeddingCredentialStackAsync(handbook.Id, stack.Id);
```
```bash
mt partition-embedding-stack <your knowledge base id> --set <your stack id>
```
```bash title="curl"
curl -X PUT https://api.maitento.com/partitions/by-id/<your knowledge base id>/embedding-credential-stack \
  -H "Authorization: $MAITENTO_AUTH" \
  -H "Content-Type: application/json" \
  -d '{"credentialStackId": "<your stack id>"}'
```
<!-- /tabs -->

From then on the knowledge base embeds on that stack's credentials, not on your model keys or the tenant's default
stack, and never on Maitento's key. Pass a null id to clear it. If the stack has nothing that serves the knowledge
base's embedding model, its files aren't indexed, and their `indexingFailure` says so
(`api:embeddings:fallback-not-permitted`). A stack can't be deleted while a knowledge base embeds with it
(`api:credential-stacks:in-use-by-partition`), or while it's the tenant's or a namespace's default. To see what uses a
stack, read `GET /credential-stacks/by-id/{id}/usage` (`mt.credentialStacks.usage(id)`, `credential_stacks.usage` in
Python, `CredentialStacks.GetUsageAsync` in C#): whether it's the tenant's default, the namespaces whose default it is,
and the knowledge bases that embed with it.

When you change a knowledge base's embedding model, you can name the stack in the same request
(`PUT /partitions/by-id/{id}/embedding-profile`), so the model and the credentials that serve it change together. With
a stack, the knowledge base needs no embedding keys of its own:

```json
{
  "profile": { "provider": "Gemini", "model": "gemini-embedding-001" },
  "credentials": [],
  "credentialStackId": "<your stack id>"
}
```

The stack is set before the model changes, so the knowledge base is never left with nothing to embed with. Leaving
`credentialStackId` out keeps whatever stack the knowledge base has.

## Subscription sign-ins for code pipelines

A [code pipeline](code-pipelines.md)'s Claude Code and Codex agents can run on a Claude (Pro or Max) or ChatGPT
subscription instead of an API key. Sign the subscription in as a credential, in two steps:

1. **Start:** `POST /credentials/sign-in/claude` (or `codex`). Claude answers with a page to sign in on; Codex answers
   with a page and a code to enter there.
2. **Finish:** `POST /credentials/sign-in/claude/finish` with the code Anthropic shows after you sign in. For Codex,
   call `.../codex/finish` every few seconds (`pollIntervalSeconds`) until its `status` is `Complete`.

<!-- tabs -->
```ts
const started = await mt.credentials.startSignIn("Codex");
```
```python
started = mt.credentials.start_sign_in("codex")
```
```csharp
var started = await mt.Credentials.StartSignInAsync(CredentialOAuthTool.Codex);
```
<!-- /tabs -->

The sign-in becomes a credential with `kind: OAuth` that you put in a stack like any other. Only code pipelines use
it, and only for the agent it signs in to. Maitento keeps its tokens fresh. To sign an existing one in again, pass its
`credentialId` when you start. A sign-in that can't be finished in 15 minutes expires (`api:credentials:sign-in-unknown`).

### Sign-ins you already hold

If your own application signs people in to Claude or Codex, bring the tokens instead of signing in again. Codex also
needs its `idToken`.

<!-- tabs -->
```ts
const credential = await mt.credentials.importSignIn({ tool: "Claude", accessToken, refreshToken, expiresAtUtc, name: "acme-claude-max" });
```
```python
credential = mt.credentials.import_sign_in(tool="Claude", access_token=access_token, refresh_token=refresh_token,
                                           expires_at_utc=expires_at_utc, name="acme-claude-max")
```
```csharp
var credential = await mt.Credentials.ImportSignInAsync(new CredentialSignInTokensRequest
{
    Tool = CredentialOAuthTool.Claude, AccessToken = accessToken, RefreshToken = refreshToken, ExpiresAtUtc = expiresAtUtc, Name = "acme-claude-max"
});
```
<!-- /tabs -->

You then keep those tokens fresh, not Maitento: two parties refreshing one sign-in would each invalidate the other's
refresh token. After each refresh, send the new tokens with `PUT /credentials/by-id/{id}/sign-in-tokens`
(`replaceSignInTokens`). The credential's `oauth.refreshedByCaller` is `true`. Each way in refuses the other kind of
sign-in: replacing the tokens of one Maitento signed in gives `api:credentials:sign-in-refreshed-here`, and signing in
again over one you brought gives `api:credentials:sign-in-refreshed-by-caller`.

To have Maitento keep the tokens fresh instead, send `keepFresh: true`:

```json
{ "tool": "Claude", "accessToken": "sk-ant-oat01-...", "refreshToken": "sk-ant-ort01-...", "expiresAtUtc": "2026-11-01T12:00:00Z", "keepFresh": true }
```

On `POST /credentials/sign-in-tokens` that makes a sign-in Maitento refreshes from the start. On
`PUT /credentials/by-id/{id}/sign-in-tokens` it hands over one you've been refreshing. Stop refreshing it yourself
once you've handed it over, because your next refresh would invalidate the refresh token Maitento now holds. A handover
can't be undone: from then on the sign-in behaves like one made in Maitento, so replacing its tokens is refused, and
you sign in again to get new ones.

## Test a credential

`POST /credentials/by-id/{id}/test` uses each key once to list the provider's models, or, for a sign-in, to read the
subscription's usage. That proves the key is accepted without running a model, so a test costs nothing. You can run a
few tests a minute.

<!-- tabs -->
```ts
const result = await mt.credentials.test(credential.id);
```
```python
result = mt.credentials.test(credential.id)
```
```csharp
var result = await mt.Credentials.TestAsync(credential.Id);
```
```bash
mt credential-test <your credential id>
```
<!-- /tabs -->

Each key gets a verdict: passed, or one of these codes.

| Code | What it means |
|---|---|
| `api:credentials:test-auth-failed` | The provider refused the key. |
| `api:credentials:test-quota-exhausted` | The key's account can't pay. |
| `api:credentials:test-endpoint-not-found` | Nothing answers at the endpoint's models route: check the URL. |
| `api:credentials:test-endpoint-refused` | Maitento won't connect to that address. |
| `api:credentials:test-unreachable` / `test-timed-out` | No answer came. |
| `api:credentials:test-provider-error` | The provider had an error of its own. |

To test a credential before you save it, send what you'd create to `POST /credentials/test`. It makes the same checks
and calls, on those keys, and stores nothing, so a key that doesn't work never becomes a credential. It shares the
same limit.

<!-- tabs -->
```ts
const check = await mt.credentials.testUnsaved({ name: "openai-production", provider: "OpenAi", keys: [{ value: process.env.OPENAI_API_KEY! }] });
if (check.succeeded) await mt.credentials.create({ name: "openai-production", provider: "OpenAi", keys: [{ value: process.env.OPENAI_API_KEY! }] });
```
```python
fields = {"name": "openai-production", "provider": "OpenAi", "keys": [{"value": os.environ["OPENAI_API_KEY"]}]}
if mt.credentials.test_unsaved(**fields).succeeded:
    mt.credentials.create(**fields)
```
```csharp
var request = new ModelCredentialRequest
{
    Name = "openai-production", Provider = ModelKeyProvider.OpenAi,
    Keys = [new ModelCredentialKeyRequest { Value = Environment.GetEnvironmentVariable("OPENAI_API_KEY")! }]
};
if ((await mt.Credentials.TestUnsavedAsync(request)).Succeeded)
    await mt.Credentials.CreateAsync(request);
```
<!-- /tabs -->

## When a credential keeps failing

A credential that fails five times in a row (each run counts once), with its keys refused, its account out of quota,
its endpoint missing, or its own endpoint unreachable, is switched off for a minute, and for longer each time it
happens again. Runs skip it while it's off. After repeated
breaks it stays off until a test of it passes. It comes back on as soon as:

- it serves a call;
- a test of it passes; or
- you change its keys or endpoint (or sign it in again).

A credential's `health` shows where it stands: `consecutiveFailures`, `disabledUntilUtc`, `offUntilTested`, and the
last failure and the last test.

## When the stack can't serve a call

| Code | What happened |
|---|---|
| `api:credentials:no-usable-credential` | No entry of the run's stack is for this provider and allows this model, or every one is switched off. Add a credential that serves the model, or change the entries' rules. |
| `api:credentials:all-failed` | Every credential that could serve the call failed. |

The run's failure details name the stack and the model.

## Keys passed with one run

A start request can still carry keys of its own, in `credentials`, instead of using a stack. A run started that way
uses those keys and your model keys. Once it ends, Maitento wipes the keys from the run, keeping only their ids and
providers as the record of what it was given.
