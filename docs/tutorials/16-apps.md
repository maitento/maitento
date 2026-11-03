---
title: 16. Apps
description: Write an app in Cogniscript that runs on Maitento and orchestrates several interactions in parallel.
sidebar:
  order: 16
---

# 16. Apps

Write a campaign generator: brainstorm three angles for a product, then write a tagline for each angle, all at the
same time. Until now, your own code started each run and waited for it. An **app** is code that runs on Maitento
itself, next to your agents. It starts interactions, reads their answers, loops, branches and runs things in
parallel, with the logic in code you control rather than in a prompt.

> **You'll learn**
>
> - what an app is for: orchestrating agents with code you control, running on Maitento
> - how an app is laid out, where it starts (`main`), and how its parameters become its inputs
> - the system calls that start interactions, wait for them and read their answers, in parallel
> - how a finished app run reports what it did, and what went wrong
>
> **New concepts:** [apps](../concepts/apps.md) · [Cogniscript](../concepts/cogniscript.md) ·
> system calls · return values and named outputs
>
> **Builds on:** [3. Typed answers](03-typed-answers.md) (the brainstorm answers in JSON that matches a schema)
>
> **Time:** ~15 min · **Cost:** under $0.01 on DeepSeek (one app run makes four short runs) · **Needs:** nothing
> beyond Get started

## 1. Write the app

Two interactions do the AI work, both with a `copywriter` agent:

- `brainstorm` takes a `product`, and answers with three angles as JSON that matches `json/ideas.json`;
- `tagline` takes a `product` and an `idea`, and writes one tagline.

<!-- snippet: examples/16-apps/maitento/interactions/one-shot/tagline.mtr -->
```hcl title="maitento/interactions/one-shot/tagline.mtr"
agent = {
  name = "Copywriter"
  agent = @ref("copywriter")
}
task = "Write one tagline of at most ten words for %%product%%, using this angle: %%idea%%. Reply with the tagline only."
inputs.prompts = [
  {
    name = "product"
    required = true
  },
  {
    name = "idea"
    required = true
  }
]
```
<!-- /snippet -->

The app ties them together. It's written in **Cogniscript**, a small language that looks like C, in `.mtc` files:

<!-- snippet: examples/16-apps/maitento/apps/taglines/taglines.mtc -->
```c title="maitento/apps/taglines/taglines.mtc"
// The taglines app: it asks for three campaign angles, then writes a tagline for each angle, all at once.
// An app starts at main. main's parameters are the app's inputs: this one has one, product.
string main(string product) {
	// Stop early, with a clear message, when the input is missing.
	if (product == "") {
		throw("Tell me which product to write taglines for.");
	}
	PrintLine("Brainstorming angles for " + product);

	// Start the brainstorm interaction and wait for it. The last three arguments are for memory,
	// model overrides and a response schema; this app uses none of them.
	jsonObject brainstormInputs = JsonObjectCreate();
	brainstormInputs = JsonObjectSetString(brainstormInputs, "product", product);
	guid brainstormId = InteractionStart("brainstorm", brainstormInputs, "[]", "[]", "");
	jsonObject brainstorm = InteractionAwait(brainstormId);
	if (JsonObjectGet(brainstorm, "status") != "Finished") {
		throw("The brainstorm failed: " + JsonObjectGet(brainstorm, "failureDetails"));
	}

	// The brainstorm's answer is JSON that matches json/ideas.json.
	jsonObject result = StringToJsonObject(JsonObjectGet(brainstorm, "output"));
	jsonArray ideas = JsonObjectGet(result, "ideas");

	// Start one tagline run per idea. They all run at the same time.
	jsonArray runIds = JsonArrayCreate();
	int ideaCount = JsonArrayCount(ideas);
	for (int i = 0; i < ideaCount; i++) {
		jsonObject inputs = JsonObjectCreate();
		inputs = JsonObjectSetString(inputs, "product", product);
		inputs = JsonObjectSetString(inputs, "idea", JsonArrayGetAtIndex(ideas, i));
		guid runId = InteractionStart("tagline", inputs, "[]", "[]", "");
		runIds = JsonArrayAdd(runIds, runId);
	}

	// Wait for every tagline run, then collect the answers.
	jsonArray runs = InteractionAwaitAll(runIds);
	jsonArray taglines = JsonArrayCreate();
	int runCount = JsonArrayCount(runs);
	for (int j = 0; j < runCount; j++) {
		jsonObject run = JsonArrayGetAtIndex(runs, j);
		if (JsonObjectGet(run, "status") == "Finished") {
			string tagline = JsonObjectGet(run, "output");
			PrintLine("- " + tagline);
			taglines = JsonArrayAdd(taglines, tagline);
		}
	}

	// A named output is what your code reads back from the finished run. return gives the run's return value.
	AppStateSetOutputJsonArray("taglines", taglines);
	return(JsonArrayCount(taglines) + " taglines");
}
```
<!-- /snippet -->

How it fits together:

- **The folder is the app.** `apps/taglines/` holds the code, `taglines.mtc`, and an optional settings file,
  `taglines.mtr`, which here stops the app if it runs for more than five minutes. The folder's name is the app's name.
- **`main` is where it starts.** Its parameters are the app's inputs, so `main(string product)` makes an app with one
  input, `product`. Every input is required, and arrives as text.
- **System calls** are the functions Maitento gives an app:

| Call | What it does |
|---|---|
| `PrintLine(text)` | writes a line to the run's console |
| `InteractionStart(name, inputs, memory, modelOverrides, schema)` | starts an interaction run, and returns its id straight away. The last three can be empty: `"[]"`, `"[]"`, `""` |
| `InteractionAwait(id)` | waits for one run, and returns it as JSON: its `status`, `output` and `failureDetails` |
| `InteractionAwaitAll(ids)` | waits for every run in a list |
| `JsonObjectCreate`, `JsonObjectSetString`, `JsonObjectGet`, `StringToJsonObject` | build and read JSON objects |
| `JsonArrayCreate`, `JsonArrayAdd`, `JsonArrayCount`, `JsonArrayGetAtIndex` | build and read JSON lists |
| `AppStateSetOutputJsonArray(name, value)` | publishes a named output, for your code to read back |

- **`return` and `throw` end the run.** `return(...)` gives the run's return value. `throw(...)` stops it with an
  error. Both need brackets.
- **JSON helpers return a new value**, so assign it back: `inputs = JsonObjectSetString(inputs, "idea", idea);`.

The `tagline` runs start one after another, but run at the same time: `InteractionStart` doesn't wait, and
`InteractionAwaitAll` collects them all.

**Done when:** the project validates. Run `mt build ./maitento`, or press **Validate** in the portal's
**Build studio**. A Cogniscript mistake is reported there, with its file and line, before anything is deployed.

## 2. Run it

<!-- tabs -->
<!-- snippet: examples/16-apps/typescript/taglines.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// Run the taglines app. Its main(string product) parameter is its one input.
const product = process.argv[2] ?? "a reusable bamboo coffee cup";
const run = await mt.apps.run("taglines", { inputs: { product } });

// What the app printed, what it returned, and its named output.
for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nReturned: ${run.returnValue}`);
console.log(`Output "taglines": ${run.outputs.find((output) => output.name === "taglines")?.value}`);
```
<!-- /snippet -->
<!-- snippet: examples/16-apps/python/taglines.py -->
```python title="Python"
import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# Run the taglines app. Its main(string product) parameter is its one input.
product = sys.argv[1] if len(sys.argv) > 1 else "a reusable bamboo coffee cup"
run = mt.apps.run("taglines", inputs={"product": product})

# What the app printed, what it returned, and its named output.
for line in run.console_outputs:
    print(line.text.rstrip())
taglines = next((output for output in run.outputs if output.name == "taglines"), None)
print(f"\nReturned: {run.return_value}")
print(f'Output "taglines": {taglines.value if taglines else None}')
```
<!-- /snippet -->
<!-- snippet: examples/16-apps/csharp/taglines.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// Run the taglines app. Its main(string product) parameter is its one input.
var product = args.Length > 0 ? args[0] : "a reusable bamboo coffee cup";
var run = await mt.Apps.RunAsync("taglines", new Dictionary<string, string> { ["product"] = product });

// What the app printed, what it returned, and its named output.
foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nReturned: {run.ReturnValue}");
Console.WriteLine($"Output \"taglines\": {run.Outputs.FirstOrDefault(output => output.Name == "taglines")?.Value}");
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt app-run taglines --input-product "a reusable bamboo coffee cup"
```
<!-- /tabs -->

```text
Brainstorming angles for a reusable bamboo coffee cup
- Crafted bamboo, naturally beautiful—your upgrade, not your sacrifice.
- One cup. One year. Zero single-use waste.
- Make it yours. Sip your ritual. Share the movement.

Returned: 3 taglines
Output "taglines": ["Crafted bamboo, naturally beautiful—your upgrade, not your sacrifice.","One cup. One year. Zero single-use waste.","Make it yours. Sip your ritual. Share the movement."]
```

A finished app run carries everything the app reported:

| On the run | Comes from |
|---|---|
| `consoleOutputs` | `PrintLine` |
| `returnValue` | `return(...)` in `main` |
| `outputs` | `AppStateSetOutput…`, one per name |
| `failureDetails` | a `throw`, or an error the app didn't catch |

Open it in the portal's **Runs**: the **Console**, **Outputs** and **Inputs** tabs show the same, and **Children**
lists the four interaction runs it started.

**Done when:** you see three taglines and `Returned: 3 taglines`.

## All the files

<!-- project: examples/16-apps -->
**On GitHub:** [`examples/16-apps`](https://github.com/maitento/maitento/tree/main/examples/16-apps) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/16-apps/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/16-apps/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/16-apps/csharp)

<details>
<summary>All the files in this project (6)</summary>

<!-- tabs: files -->
**`maitento/agents/copywriter.mtr`**
```hcl title="maitento/agents/copywriter.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a sharp, playful marketing copywriter."
summary = "Writes marketing copy"
```

**`maitento/apps/taglines/taglines.mtc`**
```c title="maitento/apps/taglines/taglines.mtc"
// The taglines app: it asks for three campaign angles, then writes a tagline for each angle, all at once.
// An app starts at main. main's parameters are the app's inputs: this one has one, product.
string main(string product) {
	// Stop early, with a clear message, when the input is missing.
	if (product == "") {
		throw("Tell me which product to write taglines for.");
	}
	PrintLine("Brainstorming angles for " + product);

	// Start the brainstorm interaction and wait for it. The last three arguments are for memory,
	// model overrides and a response schema; this app uses none of them.
	jsonObject brainstormInputs = JsonObjectCreate();
	brainstormInputs = JsonObjectSetString(brainstormInputs, "product", product);
	guid brainstormId = InteractionStart("brainstorm", brainstormInputs, "[]", "[]", "");
	jsonObject brainstorm = InteractionAwait(brainstormId);
	if (JsonObjectGet(brainstorm, "status") != "Finished") {
		throw("The brainstorm failed: " + JsonObjectGet(brainstorm, "failureDetails"));
	}

	// The brainstorm's answer is JSON that matches json/ideas.json.
	jsonObject result = StringToJsonObject(JsonObjectGet(brainstorm, "output"));
	jsonArray ideas = JsonObjectGet(result, "ideas");

	// Start one tagline run per idea. They all run at the same time.
	jsonArray runIds = JsonArrayCreate();
	int ideaCount = JsonArrayCount(ideas);
	for (int i = 0; i < ideaCount; i++) {
		jsonObject inputs = JsonObjectCreate();
		inputs = JsonObjectSetString(inputs, "product", product);
		inputs = JsonObjectSetString(inputs, "idea", JsonArrayGetAtIndex(ideas, i));
		guid runId = InteractionStart("tagline", inputs, "[]", "[]", "");
		runIds = JsonArrayAdd(runIds, runId);
	}

	// Wait for every tagline run, then collect the answers.
	jsonArray runs = InteractionAwaitAll(runIds);
	jsonArray taglines = JsonArrayCreate();
	int runCount = JsonArrayCount(runs);
	for (int j = 0; j < runCount; j++) {
		jsonObject run = JsonArrayGetAtIndex(runs, j);
		if (JsonObjectGet(run, "status") == "Finished") {
			string tagline = JsonObjectGet(run, "output");
			PrintLine("- " + tagline);
			taglines = JsonArrayAdd(taglines, tagline);
		}
	}

	// A named output is what your code reads back from the finished run. return gives the run's return value.
	AppStateSetOutputJsonArray("taglines", taglines);
	return(JsonArrayCount(taglines) + " taglines");
}
```

**`maitento/apps/taglines/taglines.mtr`**
```hcl title="maitento/apps/taglines/taglines.mtr"
// Optional settings for the app. Stop it if it runs for more than five minutes.
duration.max = "00:05:00"
```

**`maitento/interactions/one-shot/brainstorm.mtr`**
```hcl title="maitento/interactions/one-shot/brainstorm.mtr"
agent = {
  name = "Copywriter"
  agent = @ref("copywriter")
}
task = "Suggest exactly three different campaign angles for this product: %%product%%"
inputs.prompts = [
  {
    name = "product"
    required = true
  }
]
schema.solution = @json("ideas")
```

**`maitento/interactions/one-shot/tagline.mtr`**
```hcl title="maitento/interactions/one-shot/tagline.mtr"
agent = {
  name = "Copywriter"
  agent = @ref("copywriter")
}
task = "Write one tagline of at most ten words for %%product%%, using this angle: %%idea%%. Reply with the tagline only."
inputs.prompts = [
  {
    name = "product"
    required = true
  },
  {
    name = "idea"
    required = true
  }
]
```

**`maitento/json/ideas.json`**
```json title="maitento/json/ideas.json"
{
  "type": "object",
  "properties": {
    "ideas": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Three short campaign angles"
    }
  },
  "required": ["ideas"],
  "additionalProperties": false
}
```
<!-- /tabs -->

</details>

<!-- /project -->

## Break it on purpose

Run the app with an empty product:

<!-- tabs -->
```bash title="TypeScript"
node taglines.ts ""
```
```bash title="Python"
python taglines.py ""
```
```bash title="C#"
dotnet run taglines.cs ""
```
<!-- /tabs -->

```text
ProcessFailedError: App run 6422bf07-1913-4e6c-8a42-391b49d42f11 ended Error: Tell me which product to write taglines for.
```

The app's first check threw, so the run ended with status `Error`, and its `failureDetails` hold the message from
`throw`. `apps.run` raises that as an error (`ProcessFailedError` in TypeScript and Python,
`MaitentoProcessFailedException` in C#). To get the failed run back instead, pass `throwOnFailure: false` in
TypeScript, `throw_on_failure=False` in Python, or `ThrowOnFailure = false` in C#'s `RunOptions`, and read `status`
and `failureDetails` yourself.

An error the app doesn't catch ends the run the same way, and its `failureDetails` name the system call that failed,
then say why, as in `InteractionStart failed: …`. Without the check, the brainstorm would have been started with an
empty product, and that error would end the run instead, less clearly. Check your inputs first.

## If it didn't work

- **The deploy fails with "Argument count mismatch for InteractionStart".** A system call takes every argument,
  even the ones you don't need. Pass `"[]", "[]", ""` for those.
- **The run fails with "InteractionStart failed: Interaction 'brainstorm' was not found in namespace …".** The app
  named an interaction that isn't in its namespace. Check the spelling, and that you deployed the whole project.
- **The run fails with "requires input for product - but value was empty".** An interaction the app started got an
  empty input. Check the inputs you build with `JsonObjectSetString`.
- **A tagline is missing.** That `tagline` run didn't finish, and the app skips runs whose `status` isn't
  `Finished`. Open the app run's **Children** to see why.

## Review

You built:

- an app that brainstorms three angles, then writes a tagline for each, all at once;
- a script that runs it and reads back its console, return value and named output;
- an input check that stops the app with your own message.

The concepts:

- [App](../concepts/apps.md): code that runs on Maitento next to your agents. It's deployed and versioned with them,
  and anyone can run it from the portal, the CLI, an automation or another app. It keeps going without you, and
  keeps one record of the whole job, with every child run linked.
- [Cogniscript](../concepts/cogniscript.md): the small C-like language apps are written in, in
  `.mtc` files. An app starts at `main`, whose parameters are its inputs.
- System calls: how an app reaches Maitento. `InteractionStart` doesn't wait, so starting several runs and then
  `InteractionAwaitAll` runs them at the same time.

**Challenge:** add a judge. After the taglines are written, start one more interaction that picks the strongest, and
make that the app's return value. Keep `taglines` as it is, because tutorial 17 schedules it. The solution is in
[`examples/16-apps/solution`](../../examples/16-apps/solution/): a new interaction and a new app, deployed on top of
the tutorial's project.

**Next:** [17. On a schedule](17-on-a-schedule.md) runs this app every morning. To learn Cogniscript itself, from
values and loops to error handling and orchestration patterns, take the [Learn Cogniscript](cogniscript/index.md)
track.
