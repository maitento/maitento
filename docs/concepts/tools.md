---
title: Tools
description: How an agent calls an HTTP API, including your own, and how a person can approve each call first.
sidebar:
  order: 6
---

# Tools

A **tool** lets an agent *do* something: look up an order, check the weather, refund a payment. Every tool is an
HTTP call. You describe the call once, and the model decides when to make it and with what arguments.

Maitento splits this into two files:

- A **connector** describes the HTTP endpoint: method, URL, parameters, the shape of the body, and *what kind* of
  authentication it needs.
- A **tool** is what the agent sees. It points at a connector, tells the model when to use it, fixes any values the
  model must not choose, supplies the credential, and can require a person's approval.

One connector can back several tools. Tools are known as **external operations** (extops) in Maitento: that's the
name of their folder (`external-operations/`), of their API and of the `mt extop-…` commands. These docs call them
tools.

Three tutorials build them up: [tutorial 8, Your first tool](../tutorials/08-first-tool.md) calls a public weather
API, [tutorial 9, Call your code](../tutorials/09-call-your-code.md) calls your own server with a secret, and
[tutorial 10, Approvals](../tutorials/10-approvals.md) makes a person approve each refund.

## A tool on a public API

<!-- snippet: examples/08-first-tool/maitento/connectors/open-api/open-meteo-forecast.mtr -->
```hcl title="connectors/open-api/open-meteo-forecast.mtr"
// The connector: the HTTP call itself. Open-Meteo's forecast API is free and needs no key.
method = "GET"
url = "https://api.open-meteo.com/v1/forecast"
description = "Current weather for a latitude and longitude, from Open-Meteo"
parameters.query = [
  {
    name = "latitude"
    description = "Latitude in decimal degrees, for example 51.5072"
    type = "number"
  },
  {
    name = "longitude"
    description = "Longitude in decimal degrees, for example -0.1276"
    type = "number"
  },
  {
    name = "current"
    description = "Comma-separated list of current weather variables"
  },
  {
    name = "temperature_unit"
    description = "celsius or fahrenheit"
  }
]
```
<!-- /snippet -->

<!-- snippet: examples/08-first-tool/maitento/external-operations/open-api/current-weather.mtr -->
```hcl title="external-operations/open-api/current-weather.mtr"
// The tool: what the agent sees. Its name is the file's name, its description is the guidance, and its arguments
// are the connector's parameters that nothing else fills in.
connector = @ref("open-meteo-forecast")
// A fixed value: Maitento adds it to every call, and the model never sees this parameter.
bindings.query:current = "temperature_2m,wind_speed_10m,weather_code"
guidance = "Gets the current temperature, the wind speed in km/h and the WMO weather code for a place. Work out the latitude and longitude of the place yourself before you call it. The response says which temperature unit it uses."
```
<!-- /snippet -->

Then give the tool to an agent with `functions = [ { ref = @ref("current-weather") } ]`, or to every agent in an
interaction with `functions.openApi`.

## Connector properties

| Property | Required | What it does |
|---|---|---|
| `method` | yes | `"GET"`, `"POST"`, `"PUT"`, `"PATCH"` or `"DELETE"` |
| `url` | yes | the full URL; `{name}` marks a path parameter |
| `description` | yes | what the endpoint does (500 characters at most) |
| `parameters.path`, `parameters.query` | no | `[ { name description required type } ]`; `type` is `string`, `number`, `integer` or `boolean` |
| `schema.request` | no | JSON Schema of the request body. **Without one, no body is sent**, even for a POST |
| `schema.response` | no | JSON Schema the response must match |
| `auth` | no | `"None"` (the default), `"Header"` or `"Maitento"`: see below |

## Tool properties

| Property | What it does |
|---|---|
| `connector` | `@ref` to the connector |
| `guidance` | when and how to use it. The model reads this, so write it for the model |
| `bindings.request:<field>`, `bindings.query:<name>`, `bindings.path:<name>` | fixed values the model never sees or chooses |
| `auth = { header = "X-Api-Key" secret = @ref("my-secret") }` | sends a [secret](secrets.md) in a header |
| `requiresApproval = true` | a person must approve each call first |

**Fix every value the model has no reason to choose.** A fixed value (a *binding*) is added to every call, and the
model never sees the parameter:

- **It saves the model's context.** Every parameter the model sees is described in every request it makes. A fixed
  one costs nothing.
- **It stops mistakes.** Models get ids, GUIDs, units and flags wrong: a misspelt variable, an id from the wrong
  account, a flag left out. A fixed value is right every time, and the model can't be talked into changing it.

When the value isn't the same for every run, such as a customer id, let the run supply it instead: see
[values from the run](#values-from-the-run-not-the-model).

## When the agent calls your server

This is the request your endpoint receives:

- **Method and URL** come from the connector, with the path and query parameters filled in.
- **The body** is the model's arguments as JSON, already checked against your `schema.request`, with your bindings
  applied. A call whose arguments don't match the schema never reaches you: the model is told what was wrong.
- **Authentication**, from `auth`:
  - `None` sends no credential.
  - `Header` sends the secret's value in the header you named. For an `Authorization` header, a value without a
    space is sent as `Bearer <value>`.
  - `Maitento` signs the call with a short-lived Maitento token. It is for connectors that call
    **Maitento's own API**, as the [knowledge](knowledge.md) and [file system](file-systems.md) examples do, and only
    those: a connector with `auth = "Maitento"` whose URL, or a redirect, names any other host is refused
    (`api:connectors:address-blocked`), so the token never reaches anyone but Maitento.

What your response does:

- **Any 2xx response:** its body is given to the model as the tool's result.
- **A redirect:** Maitento follows up to five. The credential goes only to the address you configured, never to
  another host a redirect points at, and never from `https` down to `http`.
- **Any other status:** the model gets an error with the status and the body, and may try again or explain the
  problem.

Answer within 100 seconds. Very large responses are cut short.

[Tutorial 9](../tutorials/09-call-your-code.md) builds a small orders API in TypeScript, Python and C# that an agent
calls.

## Approvals

With `requiresApproval = true`, the run stops before the call with status `PendingApproval`. Its `pendingApproval`
says which tool and with what arguments:

```json
{
  "id": "8344c6ae-bc78-49c2-98fd-19dd69fde582",
  "functionName": "refund-order",
  "argumentsJson": "{\"request\":{\"amount\":12.5,\"reason\":\"Blue mug arrived smashed\"},\"additionalInputs\":{\"path.orderId\":\"A-1001\"}}",
  "status": "Pending",
  "agentName": "Support"
}
```

Approve it and Maitento makes the call. Reject it with a reason, and the agent is told why and redrafts.

<!-- tabs -->
```ts
await mt.interactionRuns.approve(run.id, { approvalId: run.pendingApproval!.id });
await mt.interactionRuns.reject(run.id, { approvalId: run.pendingApproval!.id, reason: "Refund the mug only" });
```
```python
mt.interaction_runs.approve(run.id, approval_id=run.pending_approval.id)
mt.interaction_runs.reject(run.id, approval_id=run.pending_approval.id, reason="Refund the mug only")
```
```csharp
await mt.InteractionProcesses.ApproveToolCallAsync(run.Id, run.PendingApproval!.Id);
await mt.InteractionProcesses.RejectToolCallAsync(run.Id, run.PendingApproval!.Id, "Refund the mug only");
```
```bash
mt interaction-approve <run id>
mt interaction-reject <run id> -r "Refund the mug only"
```
<!-- /tabs -->

A redrafted call is a **new** approval, with a new `pendingApproval.id`, and each approval can be answered once. The
SDKs' `run()` helpers call your `onWaiting` callback (`on_waiting` in Python, `OnWaiting` in C#) each time the run
starts waiting for a person, so a script that approves from `onWaiting` is asked again for every redraft. See it in
[tutorial 10, Approvals](../tutorials/10-approvals.md#4-break-it-on-purpose-reject-with-a-reason).

Approvals happen only in interactions. A tool that needs approval, called from an [app](apps.md), is not run: the
call fails with an error that says so, because an app has nobody to ask.

## Values from the run, not the model

Sometimes a value belongs to the run, such as a customer id or a knowledge base id, and the model must never choose
it. Declare it on the interaction with `inputs.functions.binding`. The value is passed as a run input and written
straight into the tool call:

<!-- snippet: examples/13-your-documents/maitento/interactions/one-shot/ask-handbook.mtr -->
```hcl title="interactions/one-shot/ask-handbook.mtr"
agent = {
  name = "HandbookAssistant"
  agent = @ref("handbook-assistant")
}
task = "An employee asks: %%question%%"
inputs.prompts = [
  {
    name = "question"
    description = "The employee's question"
    required = true
  }
]
functions.openApi = [
  {
    name = "search-handbook"
    ref = @ref("search-handbook")
  }
]
// A run input, partitionId, goes straight into the tool's request body.
// The model never sees it or chooses it: it only writes the query.
inputs.functions.binding = [
  {
    function = @ref("search-handbook")
    name = "partitionId"
    target = "partitionId"
    description = "The knowledge base to search"
    required = true
    type = "request"
  }
]
```
<!-- /snippet -->

| Field | What it does |
|---|---|
| `name` | the run input that carries the value, passed like any other input (`partitionId` above) |
| `function` | the tool whose calls get the value |
| `agent` | the agent whose tool it is, when the tool comes from that agent's `functions`. Leave it out when the interaction hands the tool out itself, with `functions.openApi`, as above. A binding for an agent's tool with no `agent` is refused when you deploy |
| `type` | what `target` names: `request` (a field of the request body, the default), `query` or `path` (a parameter) |
| `target` | the field or parameter's name. Separate the names of a nested body field with `/` |
| `required`, `default`, `description` | as for any input: see below |

A binding with a `default` (or an `inputs.functions.auth` input with a default secret) uses it when a run leaves the
input out or passes it empty, even when the input is `required`. A required input with no default must be given, or
the run is refused with `api:interactions:input-required`.

Like a fixed value, the parameter is never shown to the model, so the agent can't change it, even if someone asks it
to. See it in [tutorial 8](../tutorials/08-first-tool.md#5-let-each-run-choose-the-unit) (a query parameter with a
default), [tutorial 13](../tutorials/13-your-documents.md) (the knowledge base to search) and
[tutorial 15](../tutorials/15-files-for-agents.md) (one file system id for three tools).

## Secrets chosen by the run

A tool's `auth` names one secret. When the secret depends on the run, such as one API key per shop or per customer,
let the run choose it with `inputs.functions.auth`:

<!-- snippet: examples/09-call-your-code/maitento/interactions/one-shot/support-any-shop.mtr -->
```hcl title="interactions/one-shot/support-any-shop.mtr"
// The support desk for any shop: each run says which shop's key the get-order tool sends.
agent = {
  name = "Support"
  agent = @ref("support-agent")
}
task = "A customer writes: %%message%%"
inputs.prompts = [
  {
    name = "message"
    description = "What the customer wrote"
    required = true
  }
]
// The run passes the id of a secret, and Maitento sends that secret's value in X-Api-Key instead of the one the tool
// names. The agent never sees it.
inputs.functions.auth = [
  {
    name = "shopKey"
    description = "The id of the secret that holds the shop's API key"
    function = @ref("get-order")
    agent = @ref("support-agent")
    header = "X-Api-Key"
    required = true
  }
]
```
<!-- /snippet -->

| Field | What it does |
|---|---|
| `name` | the run input. Its value is the secret's **id**: not its name, and never its value |
| `function`, `agent` | which tool, and whose, as for a binding |
| `header` | the header the secret's value is sent in (`Authorization` when left out) |
| `required` | whether a run must choose one |
| `secret` | the default, as `@ref("…")`: the secret used when a run doesn't choose one |

- **The run's secret replaces the tool's own** `auth` for that run. A run that chooses none sends the input's default
  `secret`; with no default, an optional input leaves the tool's own `auth` in place.
- **A name is refused when the run starts.** The run fails to start with `api:interactions:input-invalid`
  (`requires valid GUID for secret ID shopKey - but value is: second-shop-api-key`). Look the secret up by name and
  pass its id.
- **An id that isn't one of your secrets** starts the run, but the tool call fails: the agent is told `Could not find
  secret … for connector …` as the tool's result, and nothing is sent.
- **The agent never sees which secret it uses**, so a customer of one shop can't talk it into reading another's
  data.

See it in [tutorial 9, Call your code](../tutorials/09-call-your-code.md#7-let-each-run-choose-the-key), where one
support agent serves two shops.

## Good to know

- **Public addresses only:** Maitento calls your endpoint from inside its own network, so it only calls addresses on
  the public internet. A connector whose URL is `localhost`, a loopback, private or link-local address (`127.0.0.1`,
  `169.254.169.254`) or an internal name (`orders-api`, `*.internal`, `*.local`) is refused when you deploy it. A name that *resolves* to such an address is refused when the tool is called, and so is a redirect to
  one. The tool's result is then an error with the code `api:connectors:address-blocked`:

  ```json
  {"error": "Maitento won't call orders.internal.example.com: the address isn't on the public internet. Tools can only call public addresses, never localhost, private networks or internal names.", "code": "api:connectors:address-blocked"}
  ```

  Any port is fine. Maitento's own hosts are refused too, except Maitento's API from a connector with
  `auth = "Maitento"`. To try a tool against a server on your own machine, give it a public address with a tunnel, as
  [tutorial 9](../tutorials/09-call-your-code.md) does.
- **A `Header` connector needs its secret.** A tool on a connector with `auth = "Header"` gets its secret from the
  tool's own `auth`, from its binding in the interaction, or from a run input
  ([`inputs.functions.auth`](#secrets-chosen-by-the-run)). An
  interaction that gives a tool none of these is refused when you deploy it, with the code
  `api:connectors:secret-missing`. If the secret is an optional run input and a run isn't given it, the agent still
  sees the tool, and calling it returns an error with the same code.
- **Optional parameters:** the model is shown every parameter as required. In the schema, make a field that may be
  missing accept `null`, and list only the fields your endpoint truly needs under `required`.
- **Turning a version off:** connectors and tools are versioned. If a version misbehaves, disable it
  (`mt connector-version-disable`, `mt extop-version-disable`) and everything pinned to it stops calling it.
- **MCP:** connectors to MCP servers can be created but can't be called yet. Use HTTP (OpenAPI) connectors.
