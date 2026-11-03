---
title: 8. Your first tool
description: Let an agent call a public API when it needs to, with one value fixed by you and one chosen by each run.
sidebar:
  order: 8
---

# 8. Your first tool

Until now, your agents could only use what they already knew. Here you give one a **tool**: ask what the weather is
like anywhere, and the agent looks it up on [Open-Meteo](https://open-meteo.com), a free weather API that needs no
key. Tools are how agents read live data and act on other systems, so this is the pattern behind most useful agents.
You also decide which parts of each call the model fills in, and which it never touches.

> **You'll learn**
>
> - how an agent calls an HTTP API through a tool
> - how to fix a value, so the model never sees it and can't get it wrong
> - how each run can supply a value that the agent can't see or change
> - what an agent does when the API answers with an error
>
> **New concepts:** [connectors and tools](../concepts/tools.md) · [fixed values](../concepts/tools.md#tool-properties)
> · [values from the run](../concepts/tools.md#values-from-the-run-not-the-model)
>
> **Builds on:** [2. Prompts and inputs](02-prompts-and-inputs.md)
>
> **Time:** ~15 min · **Cost:** under $0.01 on DeepSeek · **Needs:** nothing beyond Get started

## 1. Describe the API: a connector

Tools are known as **external operations** (extops) in Maitento: that's the name of their folder
(`external-operations/`), of their API and of the `mt extop-…` commands. These docs call them tools.

A tool is made of two files:

- A **connector** describes the HTTP call: the URL and method, the parameters, the shape of the body, and what kind
  of authentication it needs. It knows nothing about agents.
- A **tool** is what an agent sees: a name, a description, and which of the connector's parameters the model fills
  in. The others you fix, or the run supplies.

One connector can back several tools. Here is Open-Meteo's forecast endpoint, with the four query parameters this
tutorial uses:

<!-- snippet: examples/08-first-tool/maitento/connectors/open-api/open-meteo-forecast.mtr -->
```hcl title="maitento/connectors/open-api/open-meteo-forecast.mtr"
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

## 2. Decide what the model fills in: the tool

<!-- snippet: examples/08-first-tool/maitento/external-operations/open-api/current-weather.mtr -->
```hcl title="maitento/external-operations/open-api/current-weather.mtr"
// The tool: what the agent sees. Its name is the file's name, its description is the guidance, and its arguments
// are the connector's parameters that nothing else fills in.
connector = @ref("open-meteo-forecast")
// A fixed value: Maitento adds it to every call, and the model never sees this parameter.
bindings.query:current = "temperature_2m,wind_speed_10m,weather_code"
guidance = "Gets the current temperature, the wind speed in km/h and the WMO weather code for a place. Work out the latitude and longitude of the place yourself before you call it. The response says which temperature unit it uses."
```
<!-- /snippet -->

The model sees a tool called `current-weather`, described by your `guidance`. Write the guidance for the model: what
the tool is for, and anything it must work out before calling it.

`bindings.query:current` **fixes** a value. Maitento adds `current=temperature_2m,wind_speed_10m,weather_code` to
every call, and the model never sees the parameter. Fix a value whenever the model has no reason to choose it:

- **It saves context.** Every parameter the model sees is described in every request it makes. A fixed one costs
  nothing.
- **It stops mistakes.** Models get ids, GUIDs, units and flags wrong: a misspelt variable, an id from the wrong
  account, a flag left out. A fixed value is right every time.

Path parameters and fields of a JSON body can be fixed the same way, with `bindings.path:<name>` and
`bindings.request:<field>`.

## 3. Give the tool to an agent

`functions` lists the tools an agent may call:

<!-- snippet: examples/08-first-tool/maitento/agents/weather-bot.mtr -->
```hcl title="maitento/agents/weather-bot.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You answer questions about the weather. Always check the current weather with your tool before you answer."
summary = "Answers weather questions"
functions = [
  {
    ref = @ref("current-weather")
  }
]
```
<!-- /snippet -->

The `weather` interaction asks it about a `city`, which each run passes in, as in
[tutorial 2](02-prompts-and-inputs.md). Step 5 shows the interaction file.

## 4. Run it

The script deploys the project, asks about Lisbon, and then prints what the agent did: each tool call, and what came
back. Run it from the language's folder, as in [Running the code](index.md#running-the-code):

<!-- tabs -->
<!-- snippet: examples/08-first-tool/typescript/weather.ts -->
```ts title="TypeScript"
import { Maitento, transcript } from "@maitento/sdk";

// The run, not the model, decides the unit: celsius, unless you pass another on the command line.
const temperatureUnit = process.argv[2] ?? "celsius";

const mt = new Maitento();
await mt.deploy("../maitento");

const run = await mt.interactions.run("weather", { inputs: { city: "Lisbon", temperatureUnit } });

// What the agent did: each tool call it made, and what came back.
for (const entry of transcript(run)) {
  if (entry.kind === "toolCall") console.log(`Tool call: ${entry.functionName} ${entry.argumentsJson}`);
  if (entry.kind === "toolResult") {
    const { result } = await mt.interactionRuns.toolResult(run.id, entry.sequence);
    console.log(`Tool result: ${result}`);
  }
}
console.log(`\n${run.output}`);
```
<!-- /snippet -->
<!-- snippet: examples/08-first-tool/python/weather.py -->
```python title="Python"
import sys

from maitento import Maitento, transcript

# The run, not the model, decides the unit: celsius, unless you pass another on the command line.
temperature_unit = sys.argv[1] if len(sys.argv) > 1 else "celsius"

mt = Maitento()
mt.deploy("../maitento")

run = mt.interactions.run("weather", inputs={"city": "Lisbon", "temperatureUnit": temperature_unit})

# What the agent did: each tool call it made, and what came back.
for entry in transcript(run):
    if entry.kind == "tool_call":
        print(f"Tool call: {entry.item.function_name} {entry.item.arguments_json}")
    elif entry.kind == "tool_result":
        print(f"Tool result: {mt.interaction_runs.tool_result(run.id, entry.sequence).result}")
print(f"\n{run.output}")
```
<!-- /snippet -->
<!-- snippet: examples/08-first-tool/csharp/weather.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Interactions;
using Maitento.Sdk;
using Maitento.Sdk.Transcripts;

// The run, not the model, decides the unit: celsius, unless you pass another on the command line.
var temperatureUnit = args.Length > 0 ? args[0] : "celsius";

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

var inputs = new Dictionary<string, string> { ["city"] = "Lisbon", ["temperatureUnit"] = temperatureUnit };
var run = await mt.Interactions.RunAsync("weather", inputs);

// What the agent did: each tool call it made, and what came back.
foreach (var entry in MaitentoTranscript.Of(run))
{
    if (entry.Item is InteractionProcessContextToolCall call)
        Console.WriteLine($"Tool call: {call.FunctionName} {call.ArgumentsJson}");
    else if (entry.Item is InteractionProcessContextToolResult)
        Console.WriteLine($"Tool result: {(await mt.InteractionProcesses.GetToolResultAsync(run.Id, entry.Sequence))?.Result}");
}
Console.WriteLine($"\n{run.Output}");
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt interaction-run weather --input-city Lisbon
```
<!-- /tabs -->

```text
Tool call: current-weather {"additionalInputs":{"query.latitude":"38.7223","query.longitude":"-9.1393"}}
Tool result: {"latitude":38.746044,"longitude":-9.175565,"generationtime_ms":0.06508827209472656,"utc_offset_seconds":0,"timezone":"GMT","timezone_abbreviation":"GMT","elevation":66.0,"current_units":{"time":"iso8601","interval":"seconds","temperature_2m":"°C","wind_speed_10m":"km/h","weather_code":"wmo code"},"current":{"time":"2026-10-26T19:00","interval":900,"temperature_2m":17.1,"wind_speed_10m":7.2,"weather_code":0}}

Lisbon is currently a pleasant 17.1 °C with clear skies and a light breeze of about 7 km/h — a lovely evening to be out and about.
```

**Done when:** you see one `Tool call` with Lisbon's coordinates, one `Tool result` from Open-Meteo, and an answer
that uses its numbers.

What happened:

1. The model saw `current-weather` with two arguments, `query.latitude` and `query.longitude`. `current` and
   `temperature_unit` weren't among them.
2. It worked out Lisbon's coordinates itself and called the tool.
3. Maitento added the fixed `current` and the run's `temperature_unit`, called Open-Meteo, and gave the response to
   the model as the tool's result.
4. The model answered from it.

The portal shows the same: open **Runs**, then the run, and the tool call and its result are in the conversation.

## 5. Let each run choose the unit

Some values belong to the run, not to the model: a customer id, the knowledge base to search, or here, the
temperature unit a person prefers. Declare them on the interaction with `inputs.functions.binding`:

<!-- snippet: examples/08-first-tool/maitento/interactions/one-shot/weather.mtr -->
```hcl title="maitento/interactions/one-shot/weather.mtr"
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
<!-- /snippet -->

- **`name`** is the run input that carries the value, passed like any other input.
- **`function`** and **`agent`** say which tool, and whose. Leave `agent` out when the interaction itself hands out
  the tool, with `functions.openApi`.
- **`type`** and **`target`** say where the value goes: a `query` or `path` parameter, or a field of the `request`
  body.
- **`required = false`** with a **`default`** lets a run leave it out. A required input must always be passed: its
  default is only used when the value passed is empty.

Like a fixed value, the parameter is never shown to the model, so the agent can't change it, even if someone asks it
to. Run the script again with `fahrenheit`:

<!-- tabs -->
```bash title="TypeScript"
node weather.ts fahrenheit
```
```bash title="Python"
python weather.py fahrenheit
```
```bash title="C#"
dotnet run weather.cs -- fahrenheit
```
```bash title="CLI"
mt interaction-run weather --input-city Lisbon --input-temperatureunit fahrenheit
```
<!-- /tabs -->

```text
Tool call: current-weather {"additionalInputs":{"query.latitude":"38.7223","query.longitude":"-9.1393"}}
Tool result: {"latitude":38.746044,"longitude":-9.175565, … "current_units":{"time":"iso8601","interval":"seconds","temperature_2m":"°F","wind_speed_10m":"km/h","weather_code":"wmo code"},"current":{"time":"2026-10-26T19:00","interval":900,"temperature_2m":62.7,"wind_speed_10m":7.2,"weather_code":0}}

Right now in Lisbon it is a clear evening at about 63°F (17°C) with a light breeze of around 7 km/h.
```

**Done when:** the tool call's arguments are the same as before, with no unit in them, and the result and the answer
are in °F.

## 6. Break it on purpose

Pass a unit Open-Meteo doesn't know: `node weather.ts kelvin`, `python weather.py kelvin`,
`dotnet run weather.cs -- kelvin` or `mt interaction-run weather --input-city Lisbon --input-temperatureunit kelvin`.

```text
Tool call: current-weather {"additionalInputs":{"query.latitude":"38.7223","query.longitude":"-9.1393"}}
Tool result: {"error": "Remote API returned status code: BadRequest with response: {\"error\":true,\"reason\":\"Invalid value at 'temperature_unit': Cannot initialize TemperatureUnit from invalid String value kelvin\"}"}
Tool call: current-weather {"additionalInputs":{"query.latitude":"38.7223","query.longitude":"-9.1393"}}
Tool result: {"error": "Remote API returned status code: BadRequest with response: {\"error\":true,\"reason\":\"Invalid value at 'temperature_unit': Cannot initialize TemperatureUnit from invalid String value kelvin\"}"}

I'm sorry, but I'm unable to retrieve the current weather for Lisbon at the moment due to a technical issue with the weather service. I'd be happy to try again shortly if you'd like.
```

Two things to notice:

- **An error is information, not a crash.** Open-Meteo answered `400 Bad Request`. Maitento gave the model the
  status and the response body as the tool's result (`"` is an escaped quote mark), and the run still finished.
  The model decides what to do with an error: retry, try something else, or explain.
- **The agent can't fix a value it doesn't own.** It tried again with the same arguments, because the bad unit isn't
  one of them, then told the person. The fix belongs where the value came from: the run's input.

## If it didn't work

- **The deploy fails with `ConnectorBindingInput 'temperatureUnit' references ExternalOperation … which is not
  defined at interaction level`.** The binding has no `agent`, and the tool belongs to the agent, not to the
  interaction. Add `agent = @ref("weather-bot")` to the binding.
- **`Interaction … does not support input for temperatureunit`.** Input names are case-sensitive: the run must pass
  `temperatureUnit`, exactly as the interaction names it.
- **The CLI says `Unrecognized command or argument '--input-temperatureUnit'`.** The CLI's input options are lower
  case: `--input-temperatureunit`.
- **There's no `Tool call` line, and the answer has no real numbers.** The model answered from memory. Check that the
  deploy succeeded and that the agent's `functions` lists the tool. A prompt that says when to use the tool helps.
- **`Tool result: {"error": "Error connecting to remote API: …"}`.** Maitento couldn't reach Open-Meteo, or it
  timed out. Try again in a minute.

## All the files

<!-- project: examples/08-first-tool -->
**On GitHub:** [`examples/08-first-tool`](https://github.com/maitento/maitento/tree/main/examples/08-first-tool) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/08-first-tool/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/08-first-tool/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/08-first-tool/csharp)

<details>
<summary>All the files in this project (4)</summary>

<!-- tabs: files -->
**`maitento/agents/weather-bot.mtr`**
```hcl title="maitento/agents/weather-bot.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You answer questions about the weather. Always check the current weather with your tool before you answer."
summary = "Answers weather questions"
functions = [
  {
    ref = @ref("current-weather")
  }
]
```

**`maitento/connectors/open-api/open-meteo-forecast.mtr`**
```hcl title="maitento/connectors/open-api/open-meteo-forecast.mtr"
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

**`maitento/external-operations/open-api/current-weather.mtr`**
```hcl title="maitento/external-operations/open-api/current-weather.mtr"
// The tool: what the agent sees. Its name is the file's name, its description is the guidance, and its arguments
// are the connector's parameters that nothing else fills in.
connector = @ref("open-meteo-forecast")
// A fixed value: Maitento adds it to every call, and the model never sees this parameter.
bindings.query:current = "temperature_2m,wind_speed_10m,weather_code"
guidance = "Gets the current temperature, the wind speed in km/h and the WMO weather code for a place. Work out the latitude and longitude of the place yourself before you call it. The response says which temperature unit it uses."
```

**`maitento/interactions/one-shot/weather.mtr`**
```hcl title="maitento/interactions/one-shot/weather.mtr"
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
<!-- /tabs -->

</details>

<!-- /project -->

## Review

You built a weather agent that looks up live data with a tool. You fixed one of the tool's values, and let each run
choose another.

- **[Connector](../concepts/tools.md):** the HTTP call: URL, method, parameters, body and kind of authentication.
- **[Tool](../concepts/tools.md#tool-properties):** what an agent sees: a name, a description (`guidance`) and the
  parameters the model fills in. Maitento's files call it an external operation.
- **[Fixed value](../concepts/tools.md#tool-properties):** `bindings.*` in the tool. It saves context and stops
  mistakes.
- **[Value from the run](../concepts/tools.md#values-from-the-run-not-the-model):** `inputs.functions.binding` on
  the interaction. The agent can't see or change it.
- **Tool errors** reach the model as the tool's result, and the model decides what to do next.

**Challenge:** whether it's a good time for a run outside depends on the air as well as the weather. Give the agent a
second tool, on Open-Meteo's free air-quality API: `GET https://air-quality-api.open-meteo.com/v1/air-quality`, with
`latitude`, `longitude` and `current` query parameters. Fix `current` to `european_aqi,pm2_5`, and ask "Is now a good
time to go for a run in Lisbon?" in a new interaction.

**Done when:** the run makes two tool calls, one to each tool, and the answer mentions the air quality.

The solution is in [`examples/08-first-tool/solution`](../../examples/08-first-tool/solution/): a second connector
and tool, the agent with both tools, and a `run-advice` interaction.

```text
Tool call: current-weather {"additionalInputs":{"query.latitude":"38.7223","query.longitude":"-9.1393"}}
Tool call: current-air-quality {"additionalInputs":{"query.latitude":"38.7223","query.longitude":"-9.1393"}}

Conditions are reasonable but not ideal: it is 16.8 °C with mainly clear skies and a light wind of 7.2 km/h, which is comfortable for running, though the air quality index of 47 sits in the moderate band (PM2.5 at 14 µg/m³). A run is fine for most people, but those with respiratory sensitivities may prefer a shorter or gentler session.
```

**Next:** [9. Call your code](09-call-your-code.md) points a tool at your own server, with a key it keeps secret.
