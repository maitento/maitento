# Tools

A **tool** lets an agent *do* something: look up an order, check the weather, refund a payment. Every tool is one
HTTP call. Tools are known as external operations (extops) in Maitento: that's the name of their folder, their API and
the `mt extop-…` commands. Everywhere else they're called tools. Concept page: `docs/concepts/tools.md`.

It takes two files:

- a **connector** (`connectors/open-api/<name>.mtr`) describes the HTTP endpoint: method, URL, parameters, the body's
  shape and what kind of authentication it needs;
- a **tool** (`external-operations/open-api/<name>.mtr`) is what the agent sees: it points at a connector, tells the
  model when to use it, fixes values the model must not choose, supplies the credential, and can require approval.

One connector can back several tools. Give a tool to an agent with `functions = [ { ref = @ref("tool") } ]`, or to
every agent in an interaction with `functions.openApi`.

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

<!-- snippet: examples/08-first-tool/maitento/external-operations/open-api/current-weather.mtr -->
```hcl title="external-operations/open-api/current-weather.mtr"
// The tool: what the agent sees. Its name is the file's name, its description is the guidance, and its arguments
// are the connector's parameters that nothing else fills in.
connector = @ref("open-meteo-forecast")
// A fixed value: Maitento adds it to every call, and the model never sees this parameter.
bindings.query:current = "temperature_2m,wind_speed_10m,weather_code"
guidance = "Gets the current temperature, the wind speed in km/h and the WMO weather code for a place. Work out the latitude and longitude of the place yourself before you call it. The response says which temperature unit it uses."
```

## Connector properties

<!-- mtr-properties: connector -->
| Property | Required | What it does |
|---|---|---|
| `method` | yes | `"GET"`, `"POST"`, `"PUT"`, `"PATCH"` or `"DELETE"` |
| `url` | yes | the full URL; `{name}` marks a path parameter. It must be a public address |
| `description` | yes | what the endpoint does, at most 500 characters |
| `parameters.path`, `parameters.query` | no | `[ { name description required type } ]`; `type` is `string`, `number`, `integer` or `boolean` |
| `schema.request` | no | JSON Schema of the body, `@json("name")`. **Without one, no body is sent**, even for a `POST` |
| `schema.response` | no | JSON Schema the response must match |
| `auth` | no | `"None"` (default), `"Header"` (a secret in a header) or `"Maitento"` (Maitento signs calls to its own API) |

## Tool properties

<!-- mtr-properties: tool -->
| Property | What it does |
|---|---|
| `connector` | `@ref` to the connector |
| `guidance` | when and how to use it. The model reads this, so write it for the model |
| `bindings.path`, `bindings.query`, `bindings.request` | fixed values, one line each: `bindings.query:<name> = "…"`, `bindings.request:<field> = "…"` |
| `auth` | the secret to send: `{ header = "X-Api-Key" secret = @ref("my-secret") }` |
| `requiresApproval` | `true`: a person approves each call first (see [interactions](interactions.md#approvals)) |

**Fix every value the model has no reason to choose.** A binding is added to every call and the model never sees the
parameter: it saves context, and the model can't get an id, a unit or a flag wrong, or be talked into changing it.

## Values from the run

When a value belongs to the run (a customer id, the knowledge base to search) rather than to every call, declare it
on the interaction with `inputs.functions.binding`. The run passes it like any input, and it goes straight into the
call:

<!-- snippet: examples/08-first-tool/maitento/interactions/one-shot/weather.mtr -->
```hcl title="interactions/one-shot/weather.mtr"
agent = {
  name = "WeatherBot"
  agent = @ref("weather-bot")
}
task = "What is the weather like in %%city%% right now? Answer in one friendly sentence."
inputs.prompts = [
  {
    name = "city"
    description = "The city to check"
    required = true
  }
]
// A value each run supplies. It goes straight into the tool call: the agent never sees it and can't change it.
inputs.functions.binding = [
  {
    name = "temperatureUnit"
    description = "celsius or fahrenheit"
    function = @ref("current-weather")
    agent = @ref("weather-bot")
    type = "query"
    target = "temperature_unit"
    required = false
    default = "celsius"
  }
]
```

- `type` is where the value goes: `query`, `path` or `request` (a body field); `target` is its name there.
- `agent` names whose tool it is. A tool given through an agent's `functions` needs it: without it the deploy fails
  with "references ExternalOperation … which is not defined at interaction level".
- Unlike a prompt input, a binding can have a `default`.

## Secrets

A tool sends a secret with `auth = { header = "…" secret = @ref("name") }`; the connector says `auth = "Header"`.

- **Create the secret before you deploy**: `mt secret-create orders-api-key --value "$ORDERS_API_KEY"`, or
  `secrets.create` in an SDK. A deploy that names a missing secret fails: "Unable to resolve resource reference for
  secret".
- **Secrets are write-only** and belong to the whole tenant, so names are unique across it. A new value needs no
  redeploy: the next call sends it.
- **A run can choose the secret** (one key per customer or shop) with `inputs.functions.auth = [ { name function agent
  header required } ]`: the run passes the secret's **id**, never its value. Example:
  `examples/09-call-your-code/maitento/interactions/one-shot/support-any-shop.mtr`.
- For an `Authorization` header, a value with no space is sent as `Bearer <value>`.

## When the agent calls your server

- Method and URL come from the connector, with path and query parameters filled in. The body is the model's
  arguments as JSON, already checked against `schema.request`, with bindings applied: arguments that don't match
  never reach you, and the model is told what was wrong.
- Any 2xx response body is the tool's result. Any other status goes back to the model as an error with the status
  and body. Up to five redirects are followed; the credential never goes to another host or from `https` to `http`.
- Answer within 100 seconds. Very large responses are cut short.
- `auth = "Maitento"` is only for connectors that call Maitento's own API (knowledge search, file systems). Any other
  host is refused with `api:connectors:address-blocked`, as is a private, loopback or internal address for any
  connector.

Examples: `examples/08-first-tool/` (a public API), `examples/09-call-your-code/` (your own server, with a secret),
`examples/10-approvals/` (a person approves each refund).
