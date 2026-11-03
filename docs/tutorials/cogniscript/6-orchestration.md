---
title: 6. Orchestration patterns
description: Retry a run that failed, run many in batches, keep the first answer, and run another app, in apps that call AI.
sidebar:
  order: 106
---

# 6. Orchestration patterns

Write a newsletter: a headline for each topic, and an opening line. Along the way, use the four patterns that come up
whenever an app runs AI. **Retry** a run that failed, but not forever. Run many in **batches**, so only a few go at
once. Start two copies and keep the **first answer** that comes back. And hand part of the job to **another app**,
then wait for it. Each pattern is a few lines of Cogniscript; what matters is knowing why, and when, to reach for it.

> **You'll learn**
>
> - how to retry a run that failed, with a limit and a pause, and which failures are worth retrying
> - how to run a long list in batches, so that no more than two runs go at once
> - how to start several runs, keep the first answer (`InteractionAwaitAny`), and stop the rest (`ProcessKill`)
> - how an app starts another app and waits for it (`AppStart`, `AppProcessAwait`), and reads its outputs
>
> **New concepts:** [an app that starts another app](../../concepts/apps.md) · [run statuses](../../concepts/runs-and-events.md)
> (`Finished`, `Error`, `Killed`)
>
> **Builds on:** [5. When things go wrong](5-errors.md), and [16. Apps](../16-apps.md), which started interactions
> from an app
>
> **Time:** ~20 min · **Cost:** under $0.01 on DeepSeek: `headlines` makes four short runs, and `newsletter` six (one
> of them stopped early) · **Needs:** a DeepSeek [model key](../../concepts/models-and-keys.md), as in the main
> tutorials

## 1. The project

One agent, `writer`, does the writing in two interactions. `headline` takes a `topic`:

<!-- snippet: examples/cogniscript-06-patterns/maitento/interactions/one-shot/headline.mtr -->
```hcl title="maitento/interactions/one-shot/headline.mtr"
agent = {
  name = "Writer"
  agent = @ref("writer")
}
task = "Write one headline of at most eight words about %%topic%%. Reply with the headline only."
inputs.prompts = [
  {
    name = "topic"
    required = true
  }
]
// The longest one headline may take. A run still going then ends with an error.
duration.max = "00:01:00"
```
<!-- /snippet -->

`opener` takes the list of `topics` and writes one welcoming sentence. Two apps use them:

- `headlines` writes one headline per topic, in batches, retrying any that fail. Its code is in two files:
  `headlines.mtc` and `retry.mtc`.
- `newsletter` runs `headlines` as a child app, and writes the opening line while the child works. Its code is in
  `newsletter.mtc` and `race.mtc`.

Every file is in [All the files](#all-the-files) below.

**Done when:** you can say which app each pattern lives in.

## 2. Retry a run that failed

Nothing retries a run on its own: a retry is just another start. `RetryRun` starts the interaction again, up to
`retries` times, and returns the first answer:

<!-- snippet: examples/cogniscript-06-patterns/maitento/apps/headlines/retry.mtc -->
```c title="maitento/apps/headlines/retry.mtc"
// Starts an interaction again after a run of it failed, up to retries more times, and returns the first answer.
string RetryRun(string interaction, jsonObject inputs, int retries) {
	string failure = "";
	for (int retry = 1; retry <= retries; retry++) {
		guid runId = InteractionStart(interaction, inputs, "[]", "[]", "");
		jsonObject run = InteractionAwait(runId);
		string status = JsonObjectGet(run, "status");
		if (status == "Finished") {
			return(JsonObjectGet(run, "output"));
		}
		failure = JsonObjectGet(run, "failureDetails");
		PrintLine("  Retry " + retry + " of " + retries + " ended " + status + ": " + failure);
		// Killed means someone stopped the run on purpose: don't start it again.
		if (status == "Killed") {
			throw(interaction + " was stopped: " + failure);
		}
		// Give a passing problem a moment to pass, a little longer each time.
		if (retry < retries) {
			Sleep(retry * 2000);
		}
	}
	throw("Gave up on " + interaction + " after " + retries + " retries: " + failure);
}
```
<!-- /snippet -->

Why each part is there:

- **Retry at all**, because some failures pass: a model provider having a bad moment, or a run that went past its
  own `duration.max`, which ends `Error` with `Interaction timed out`. The next attempt may well work.
- **A limit**, because some failures don't pass. A run that fails for a reason that stays, such as a task the model
  can't do, fails every time, and every attempt costs. Two retries, then the app gives up with a message that says
  what failed and why.
- **A pause**, longer each time. [`Sleep`](../../reference/cogniscript/system-calls/miscellaneous.md#sleep) takes
  milliseconds. A problem that passes often needs a moment.
- **No retry for `Killed`.** A `Killed` run was stopped on purpose, by someone or by code such as `FirstAnswer` in
  step 4. Starting it again would undo that.

[`InteractionAwait`](../../reference/cogniscript/system-calls/interactions.md#interactionawait) waits for a run to
end, whether it finished or failed, so always check its `status` before you use its `output`.

**Done when:** you can say how many runs `RetryRun("headline", inputs, 2)` starts, at most.

## 3. Fan out in batches

<!-- snippet: examples/cogniscript-06-patterns/maitento/apps/headlines/headlines.mtc#batches -->
```c title="maitento/apps/headlines/headlines.mtc"
int batchSize = 2;
jsonArray headlines = JsonArrayCreate();
for (int first = 0; first < count; first = first + batchSize) {
	// Start one run per topic in this batch. InteractionStart doesn't wait, so they run at the same time.
	jsonArray runIds = JsonArrayCreate();
	jsonObject topicOf = JsonObjectCreate();
	for (int i = first; i < first + batchSize && i < count; i++) {
		string topic = StringTrim(JsonArrayGetAtIndex(list, i));
		guid runId = InteractionStart("headline", TopicInputs(topic), "[]", "[]", "");
		runIds = JsonArrayAdd(runIds, runId);
		// Runs can come back in any order, so remember which topic each run is for.
		topicOf = JsonObjectSetString(topicOf, runId, topic);
	}
	PrintLine("Batch of " + JsonArrayCount(runIds) + " started");

	// Wait for the whole batch before the next one starts.
	jsonArray runs = InteractionAwaitAll(runIds);
	for (int j = 0; j < JsonArrayCount(runs); j++) {
		jsonObject run = JsonArrayGetAtIndex(runs, j);
		string topic = JsonObjectGet(topicOf, JsonObjectGet(run, "id"));
		string status = JsonObjectGet(run, "status");
		string headline = JsonObjectGet(run, "output");
		if (status == "Error") {
			// A failed run may work next time. RetryRun is in retry.mtc.
			PrintLine("Retrying " + topic + ": " + JsonObjectGet(run, "failureDetails"));
			jsonObject inputs = TopicInputs(topic);
			headline = RetryRun("headline", inputs, 2);
		} else if (status != "Finished") {
			throw("The headline run for " + topic + " was stopped.");
		}
		PrintLine("- " + topic + ": " + headline);
		headlines = JsonArrayAdd(headlines, headline);
	}
}
```
<!-- /snippet -->

Tutorial 16 started a run for every idea at once. That's fastest, until the list is long: 200 topics would start 200
runs at once, all calling the model together. That's when you meet your model provider's rate limits, and spend the
whole cost in one go. Batches cap how many run at once: start two, wait for both with
[`InteractionAwaitAll`](../../reference/cogniscript/system-calls/interactions.md#interactionawaitall), then start the
next two.

- **Runs come back in any order**, not the order you started them. So the app keeps `topicOf`, a JSON object from
  each run's id to its topic, and looks every run up by its `id`.
- **A failed run ends the wait too**, so the app checks each run's `status`: `Error` goes to `RetryRun`, and anything
  else that isn't `Finished` stops the app.
- **A batch is as slow as its slowest run.** While one run takes its time, the other place in the batch sits empty.
  The challenge at the end fixes that.

Run it from the language's folder in
[`examples/cogniscript-06-patterns`](../../../examples/cogniscript-06-patterns/), as in the
[track's overview](index.md):

<!-- tabs -->
<!-- snippet: examples/cogniscript-06-patterns/typescript/headlines.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// Run the headlines app: one headline per topic, at most two at a time.
const topics = process.argv[2] ?? "electric cars, city farming, space tourism, quantum computing";
const run = await mt.apps.run("headlines", { inputs: { topics } });

for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nReturned: ${run.returnValue}`);
for (const output of run.outputs) console.log(`Output "${output.name}": ${output.value}`);
```
<!-- /snippet -->
<!-- snippet: examples/cogniscript-06-patterns/python/headlines.py -->
```python title="Python"
import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# Run the headlines app: one headline per topic, at most two at a time.
topics = sys.argv[1] if len(sys.argv) > 1 else "electric cars, city farming, space tourism, quantum computing"
run = mt.apps.run("headlines", inputs={"topics": topics})

for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nReturned: {run.return_value}")
for output in run.outputs:
    print(f'Output "{output.name}": {output.value}')
```
<!-- /snippet -->
<!-- snippet: examples/cogniscript-06-patterns/csharp/headlines.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// Run the headlines app: one headline per topic, at most two at a time.
var topics = args.Length > 0 ? args[0] : "electric cars, city farming, space tourism, quantum computing";
var run = await mt.Apps.RunAsync("headlines", new Dictionary<string, string> { ["topics"] = topics });

foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nReturned: {run.ReturnValue}");
foreach (var output in run.Outputs) Console.WriteLine($"Output \"{output.Name}\": {output.Value}");
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt app-run headlines --input-topics "electric cars, city farming, space tourism, quantum computing"
```
<!-- /tabs -->

```text
Batch of 2 started
- electric cars: Electric Cars Drive the Future Forward
- city farming: Cities Grow Fresh Food on Rooftops
Batch of 2 started
- quantum computing: Quantum Computing Nears Real-World Breakthrough
- space tourism: Space Tourism Takes Off at Last

Returned: 4 headlines
Output "headlines": ["Electric Cars Drive the Future Forward","Cities Grow Fresh Food on Rooftops","Quantum Computing Nears Real-World Breakthrough","Space Tourism Takes Off at Last"]
```

Within a batch, the topics can come back in either order. In the portal's **Runs**, the app run's **Children** lists
the four `headline` runs: two started together, then two more once the first pair had ended.

**Done when:** you see two batches and `Returned: 4 headlines`.

## 4. Keep the first answer

A model's answer can take one second or ten. When waiting costs more than a second run, because a person is waiting
for the answer, start two copies and keep whichever answers first. `FirstAnswer` does that:

<!-- snippet: examples/cogniscript-06-patterns/maitento/apps/newsletter/race.mtc -->
```c title="maitento/apps/newsletter/race.mtc"
// Starts the same interaction several times, and returns the first answer that comes back. The others are stopped.
string FirstAnswer(string interaction, jsonObject inputs, int copies) {
	jsonArray waiting = JsonArrayCreate();
	for (int i = 0; i < copies; i++) {
		guid runId = InteractionStart(interaction, inputs, "[]", "[]", "");
		waiting = JsonArrayAdd(waiting, runId);
	}

	while (JsonArrayCount(waiting) > 0) {
		// InteractionAwaitAny returns as soon as a run ends, with every run in the list that has ended so far.
		jsonArray ended = InteractionAwaitAny(waiting);
		for (int i = 0; i < JsonArrayCount(ended); i++) {
			jsonObject run = JsonArrayGetAtIndex(ended, i);
			waiting = Without(waiting, JsonObjectGet(run, "id"));
			if (JsonObjectGet(run, "status") == "Finished") {
				// The others are still running, and still costing: stop them.
				StopAll(waiting);
				return(JsonObjectGet(run, "output"));
			}
			PrintLine("A copy of " + interaction + " ended " + JsonObjectGet(run, "status") + ": " + JsonObjectGet(run, "failureDetails"));
		}
	}
	throw("Every copy of " + interaction + " failed.");
}

// Stops every run in the list. Stopping a run that has already ended fails, and one may end just before it's stopped,
// so each stop has its own try.
void StopAll(jsonArray runIds) {
	for (int i = 0; i < JsonArrayCount(runIds); i++) {
		string runId = JsonArrayGetAtIndex(runIds, i);
		try {
			ProcessKill(runId, "Interaction");
			PrintLine("Stopped the slower copy");
		} catch {
			PrintLine("The slower copy had already ended");
		}
	}
}

// The list without one value.
jsonArray Without(jsonArray values, string value) {
	jsonArray kept = JsonArrayCreate();
	for (int i = 0; i < JsonArrayCount(values); i++) {
		string item = JsonArrayGetAtIndex(values, i);
		if (item != value) {
			kept = JsonArrayAdd(kept, item);
		}
	}
	return(kept);
}
```
<!-- /snippet -->

- [`InteractionAwaitAny`](../../reference/cogniscript/system-calls/interactions.md#interactionawaitany) returns as
  soon as one run ends, with **every** run in the list that has ended so far. That can be more than one, and a run
  that failed counts as ended. So the app looks at each, takes the first one that finished, and takes the ended ones
  out of `waiting` before it waits again.
- **The others keep going, and keep costing, until you stop them.**
  [`ProcessKill`](../../reference/cogniscript/system-calls/runs.md#processkill) stops a run, and returns at once
  without waiting for it to end.
- **Stopping a run that has already ended fails**, with `Invalid kill request: Process is not running`, and a copy can
  end on its own just before the app stops it. So each stop has its own `try`.

Up to twice the cost for a faster answer: worth it where speed matters, and not for work nobody's waiting on.

**Done when:** you can say what `FirstAnswer` does when the first copy to end has failed.

## 5. An app that starts another app

The `headlines` app is useful on its own. The newsletter reuses it rather than copying its code:

<!-- snippet: examples/cogniscript-06-patterns/maitento/apps/newsletter/newsletter.mtc#start-child -->
```c title="maitento/apps/newsletter/newsletter.mtc"
// AppStart starts another app and returns its run id straight away, as InteractionStart does.
jsonObject childInputs = JsonObjectCreate();
childInputs = JsonObjectSetString(childInputs, "topics", topics);
guid childId = AppStart("headlines", childInputs);
PrintLine("Started the headlines app");
```
<!-- /snippet -->

[`AppStart`](../../reference/cogniscript/system-calls/apps.md#appstart) starts an app and returns its run id straight
away, as `InteractionStart` does. The child runs the app's latest version, needs every one of its inputs, and runs
with the same model keys and settings as the app that started it. Name an app in another namespace as
`name@namespace`.

Because `AppStart` doesn't wait, the newsletter gets on with the opening line while the child works:

<!-- snippet: examples/cogniscript-06-patterns/maitento/apps/newsletter/newsletter.mtc#race -->
```c title="maitento/apps/newsletter/newsletter.mtc"
// While the child works, start two copies of the opener and keep whichever answers first. FirstAnswer is in
// race.mtc.
jsonObject openerInputs = JsonObjectCreate();
openerInputs = JsonObjectSetString(openerInputs, "topics", topics);
string opener = FirstAnswer("opener", openerInputs, 2);
PrintLine("Opening line: " + opener);
```
<!-- /snippet -->

Then it waits for the child:

<!-- snippet: examples/cogniscript-06-patterns/maitento/apps/newsletter/newsletter.mtc#await-child -->
```c title="maitento/apps/newsletter/newsletter.mtc"
// Now wait for the child. AppProcessAwait returns its run, with its status, returnValue, outputs and failureDetails.
jsonObject child = AppProcessAwait(childId);
if (JsonObjectGet(child, "status") != "Finished") {
	throw("The headlines app failed: " + JsonObjectGet(child, "failureDetails"));
}
PrintLine("The headlines app returned: " + JsonObjectGet(child, "returnValue"));
jsonArray headlines = OutputOf(child, "headlines");
```
<!-- /snippet -->

[`AppProcessAwait`](../../reference/cogniscript/system-calls/apps.md#appprocessawait) returns the child's run, with
the same fields your scripts read: `status`, `returnValue`, `outputs` and `failureDetails`. A failed child ends the
wait too, so check its `status`. Its outputs are a list, so `OutputOf` finds one by name:

<!-- snippet: examples/cogniscript-06-patterns/maitento/apps/newsletter/newsletter.mtc#output-of -->
```c title="maitento/apps/newsletter/newsletter.mtc"
// The value of one named output of a finished app run. The run's outputs are a list of { name, type, value, date }.
string OutputOf(jsonObject run, string name) {
	jsonArray outputs = JsonObjectGet(run, "outputs");
	for (int i = 0; i < JsonArrayCount(outputs); i++) {
		jsonObject output = JsonArrayGetAtIndex(outputs, i);
		if (JsonObjectGet(output, "name") == name) {
			return(JsonObjectGet(output, "value"));
		}
	}
	throw("The run has no output called " + name);
}
```
<!-- /snippet -->

An output's `value` is always text. For a `JsonArray` output it's the list's JSON, so it goes straight into a
`jsonArray`.

Why a child app, and not one bigger app? The child keeps its own run, with its own console, outputs and time limit,
linked under the parent's. Either app can change without the other. And the headlines app still runs on its own, from
the portal, the CLI or an automation.

<!-- tabs -->
<!-- snippet: examples/cogniscript-06-patterns/typescript/newsletter.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// Run the newsletter app. It runs the headlines app itself, as a child.
const topics = process.argv[2] ?? "electric cars, city farming, space tourism, quantum computing";
const run = await mt.apps.run("newsletter", { inputs: { topics } });

for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nReturned: ${run.returnValue}`);
for (const output of run.outputs) console.log(`Output "${output.name}": ${output.value}`);
```
<!-- /snippet -->
<!-- snippet: examples/cogniscript-06-patterns/python/newsletter.py -->
```python title="Python"
import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# Run the newsletter app. It runs the headlines app itself, as a child.
topics = sys.argv[1] if len(sys.argv) > 1 else "electric cars, city farming, space tourism, quantum computing"
run = mt.apps.run("newsletter", inputs={"topics": topics})

for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nReturned: {run.return_value}")
for output in run.outputs:
    print(f'Output "{output.name}": {output.value}')
```
<!-- /snippet -->
<!-- snippet: examples/cogniscript-06-patterns/csharp/newsletter.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// Run the newsletter app. It runs the headlines app itself, as a child.
var topics = args.Length > 0 ? args[0] : "electric cars, city farming, space tourism, quantum computing";
var run = await mt.Apps.RunAsync("newsletter", new Dictionary<string, string> { ["topics"] = topics });

foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nReturned: {run.ReturnValue}");
foreach (var output in run.Outputs) Console.WriteLine($"Output \"{output.Name}\": {output.Value}");
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt app-run newsletter --input-topics "electric cars, city farming, space tourism, quantum computing"
```
<!-- /tabs -->

```text
Started the headlines app
Stopped the slower copy
Opening line: Welcome to this edition, where we explore electric cars, city farming, space tourism, and quantum computing—four frontiers shaping how we'll live, work, and travel tomorrow.
The headlines app returned: 4 headlines

Returned: Welcome to this edition, where we explore electric cars, city farming, space tourism, and quantum computing—four frontiers shaping how we'll live, work, and travel tomorrow.
- Urban Farms Are Growing City Food
- Electric Cars Drive the Future Forward
- Quantum Computing Enters the Practical Era
- Space Tourism Prepares for Takeoff
```

If both copies of the opener end at almost the same moment, the second line reads `The slower copy had already ended`
instead. In the portal's **Runs**, the newsletter's **Children** are the `headlines` app run and the two `opener`
runs, one of them `Killed`. The `headline` runs are the headlines app's own children.

**Done when:** you see the opening line, then four headlines.

> **A parent that waits holds its place.** An app run keeps the place it runs in for as long as it runs, waiting
> included, and its child needs a place of its own. When every place is taken by apps waiting for children that haven't
> started, nothing moves until those apps reach their `duration.max`. So nest one level, as here, rather than chains of
> apps that each wait for the next, and give every app a `duration.max`.

## All the files

<!-- project: examples/cogniscript-06-patterns -->
**On GitHub:** [`examples/cogniscript-06-patterns`](https://github.com/maitento/maitento/tree/main/examples/cogniscript-06-patterns) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/cogniscript-06-patterns/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/cogniscript-06-patterns/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/cogniscript-06-patterns/csharp)

<details>
<summary>All the files in this project (9)</summary>

<!-- tabs: files -->
**`maitento/agents/writer.mtr`**
```hcl title="maitento/agents/writer.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a newsletter editor. You write short, clear, friendly copy."
summary = "Writes newsletter copy"
```

**`maitento/apps/headlines/headlines.mtc`**
```c title="maitento/apps/headlines/headlines.mtc"
// The headlines app: one headline per topic, written in batches so that no more than two run at once.
string main(string topics) {
	jsonArray list = StringSplit(topics, ",", true);
	int count = JsonArrayCount(list);
	if (StringTrim(topics) == "") {
		throw("Send at least one topic. Separate topics with commas.");
	}

	// region:batches
	int batchSize = 2;
	jsonArray headlines = JsonArrayCreate();
	for (int first = 0; first < count; first = first + batchSize) {
		// Start one run per topic in this batch. InteractionStart doesn't wait, so they run at the same time.
		jsonArray runIds = JsonArrayCreate();
		jsonObject topicOf = JsonObjectCreate();
		for (int i = first; i < first + batchSize && i < count; i++) {
			string topic = StringTrim(JsonArrayGetAtIndex(list, i));
			guid runId = InteractionStart("headline", TopicInputs(topic), "[]", "[]", "");
			runIds = JsonArrayAdd(runIds, runId);
			// Runs can come back in any order, so remember which topic each run is for.
			topicOf = JsonObjectSetString(topicOf, runId, topic);
		}
		PrintLine("Batch of " + JsonArrayCount(runIds) + " started");

		// Wait for the whole batch before the next one starts.
		jsonArray runs = InteractionAwaitAll(runIds);
		for (int j = 0; j < JsonArrayCount(runs); j++) {
			jsonObject run = JsonArrayGetAtIndex(runs, j);
			string topic = JsonObjectGet(topicOf, JsonObjectGet(run, "id"));
			string status = JsonObjectGet(run, "status");
			string headline = JsonObjectGet(run, "output");
			if (status == "Error") {
				// A failed run may work next time. RetryRun is in retry.mtc.
				PrintLine("Retrying " + topic + ": " + JsonObjectGet(run, "failureDetails"));
				jsonObject inputs = TopicInputs(topic);
				headline = RetryRun("headline", inputs, 2);
			} else if (status != "Finished") {
				throw("The headline run for " + topic + " was stopped.");
			}
			PrintLine("- " + topic + ": " + headline);
			headlines = JsonArrayAdd(headlines, headline);
		}
	}
	// endregion

	AppStateSetOutputJsonArray("headlines", headlines);
	return(JsonArrayCount(headlines) + " headlines");
}

// The inputs of one headline run.
jsonObject TopicInputs(string topic) {
	jsonObject inputs = JsonObjectCreate();
	inputs = JsonObjectSetString(inputs, "topic", topic);
	return(inputs);
}
```

**`maitento/apps/headlines/headlines.mtr`**
```hcl title="maitento/apps/headlines/headlines.mtr"
// Optional settings for the app. Stop it if it runs for more than five minutes.
duration.max = "00:05:00"
```

**`maitento/apps/headlines/retry.mtc`**
```c title="maitento/apps/headlines/retry.mtc"
// Starts an interaction again after a run of it failed, up to retries more times, and returns the first answer.
string RetryRun(string interaction, jsonObject inputs, int retries) {
	string failure = "";
	for (int retry = 1; retry <= retries; retry++) {
		guid runId = InteractionStart(interaction, inputs, "[]", "[]", "");
		jsonObject run = InteractionAwait(runId);
		string status = JsonObjectGet(run, "status");
		if (status == "Finished") {
			return(JsonObjectGet(run, "output"));
		}
		failure = JsonObjectGet(run, "failureDetails");
		PrintLine("  Retry " + retry + " of " + retries + " ended " + status + ": " + failure);
		// Killed means someone stopped the run on purpose: don't start it again.
		if (status == "Killed") {
			throw(interaction + " was stopped: " + failure);
		}
		// Give a passing problem a moment to pass, a little longer each time.
		if (retry < retries) {
			Sleep(retry * 2000);
		}
	}
	throw("Gave up on " + interaction + " after " + retries + " retries: " + failure);
}
```

**`maitento/apps/newsletter/newsletter.mtc`**
```c title="maitento/apps/newsletter/newsletter.mtc"
// The newsletter app: it runs the headlines app as a child, and writes the opening line while the child works.
string main(string topics) {
	// region:start-child
	// AppStart starts another app and returns its run id straight away, as InteractionStart does.
	jsonObject childInputs = JsonObjectCreate();
	childInputs = JsonObjectSetString(childInputs, "topics", topics);
	guid childId = AppStart("headlines", childInputs);
	PrintLine("Started the headlines app");
	// endregion

	// region:race
	// While the child works, start two copies of the opener and keep whichever answers first. FirstAnswer is in
	// race.mtc.
	jsonObject openerInputs = JsonObjectCreate();
	openerInputs = JsonObjectSetString(openerInputs, "topics", topics);
	string opener = FirstAnswer("opener", openerInputs, 2);
	PrintLine("Opening line: " + opener);
	// endregion

	// region:await-child
	// Now wait for the child. AppProcessAwait returns its run, with its status, returnValue, outputs and failureDetails.
	jsonObject child = AppProcessAwait(childId);
	if (JsonObjectGet(child, "status") != "Finished") {
		throw("The headlines app failed: " + JsonObjectGet(child, "failureDetails"));
	}
	PrintLine("The headlines app returned: " + JsonObjectGet(child, "returnValue"));
	jsonArray headlines = OutputOf(child, "headlines");
	// endregion

	string newsletter = opener;
	for (int i = 0; i < JsonArrayCount(headlines); i++) {
		newsletter = newsletter + "\n- " + JsonArrayGetAtIndex(headlines, i);
	}
	return(newsletter);
}

// region:output-of
// The value of one named output of a finished app run. The run's outputs are a list of { name, type, value, date }.
string OutputOf(jsonObject run, string name) {
	jsonArray outputs = JsonObjectGet(run, "outputs");
	for (int i = 0; i < JsonArrayCount(outputs); i++) {
		jsonObject output = JsonArrayGetAtIndex(outputs, i);
		if (JsonObjectGet(output, "name") == name) {
			return(JsonObjectGet(output, "value"));
		}
	}
	throw("The run has no output called " + name);
}
// endregion
```

**`maitento/apps/newsletter/newsletter.mtr`**
```hcl title="maitento/apps/newsletter/newsletter.mtr"
// Optional settings for the app. Stop it if it runs for more than five minutes.
duration.max = "00:05:00"
```

**`maitento/apps/newsletter/race.mtc`**
```c title="maitento/apps/newsletter/race.mtc"
// Starts the same interaction several times, and returns the first answer that comes back. The others are stopped.
string FirstAnswer(string interaction, jsonObject inputs, int copies) {
	jsonArray waiting = JsonArrayCreate();
	for (int i = 0; i < copies; i++) {
		guid runId = InteractionStart(interaction, inputs, "[]", "[]", "");
		waiting = JsonArrayAdd(waiting, runId);
	}

	while (JsonArrayCount(waiting) > 0) {
		// InteractionAwaitAny returns as soon as a run ends, with every run in the list that has ended so far.
		jsonArray ended = InteractionAwaitAny(waiting);
		for (int i = 0; i < JsonArrayCount(ended); i++) {
			jsonObject run = JsonArrayGetAtIndex(ended, i);
			waiting = Without(waiting, JsonObjectGet(run, "id"));
			if (JsonObjectGet(run, "status") == "Finished") {
				// The others are still running, and still costing: stop them.
				StopAll(waiting);
				return(JsonObjectGet(run, "output"));
			}
			PrintLine("A copy of " + interaction + " ended " + JsonObjectGet(run, "status") + ": " + JsonObjectGet(run, "failureDetails"));
		}
	}
	throw("Every copy of " + interaction + " failed.");
}

// Stops every run in the list. Stopping a run that has already ended fails, and one may end just before it's stopped,
// so each stop has its own try.
void StopAll(jsonArray runIds) {
	for (int i = 0; i < JsonArrayCount(runIds); i++) {
		string runId = JsonArrayGetAtIndex(runIds, i);
		try {
			ProcessKill(runId, "Interaction");
			PrintLine("Stopped the slower copy");
		} catch {
			PrintLine("The slower copy had already ended");
		}
	}
}

// The list without one value.
jsonArray Without(jsonArray values, string value) {
	jsonArray kept = JsonArrayCreate();
	for (int i = 0; i < JsonArrayCount(values); i++) {
		string item = JsonArrayGetAtIndex(values, i);
		if (item != value) {
			kept = JsonArrayAdd(kept, item);
		}
	}
	return(kept);
}
```

**`maitento/interactions/one-shot/headline.mtr`**
```hcl title="maitento/interactions/one-shot/headline.mtr"
agent = {
  name = "Writer"
  agent = @ref("writer")
}
task = "Write one headline of at most eight words about %%topic%%. Reply with the headline only."
inputs.prompts = [
  {
    name = "topic"
    required = true
  }
]
// The longest one headline may take. A run still going then ends with an error.
duration.max = "00:01:00"
```

**`maitento/interactions/one-shot/opener.mtr`**
```hcl title="maitento/interactions/one-shot/opener.mtr"
agent = {
  name = "Writer"
  agent = @ref("writer")
}
task = "Write one welcoming sentence that opens a newsletter about these topics: %%topics%%. Reply with the sentence only."
inputs.prompts = [
  {
    name = "topics"
    required = true
  }
]
duration.max = "00:01:00"
```
<!-- /tabs -->

</details>

<!-- /project -->

## Break it on purpose

Make every headline fail. In `agents/writer.mtr`, point the writer at a provider you have no
[model key](../../concepts/models-and-keys.md) for. We used Qwen:

```hcl
model = @ref("qwen.qwen3.7-flash")
```

Deploy, and run the headlines app with one topic:

<!-- tabs -->
```bash title="TypeScript"
node headlines.ts "electric cars"
```
```bash title="Python"
python headlines.py "electric cars"
```
```bash title="C#"
dotnet run headlines.cs "electric cars"
```
<!-- /tabs -->

```text
ProcessFailedError: App run d31808b9-c326-4bf6-82ca-6ca077ab2ae1 ended Error: Gave up on headline after 2 retries: No model key is configured for provider 'Qwen'. Add one under Settings → Model keys (or POST /tenants/self/model-keys). Or allow the run to use Maitento's own key (allowMaitentoFallback). [api:model-keys:none-for-provider]
```

Open the run in the portal's **Runs**. Its **Console** shows each attempt:

```text
Batch of 1 started
Retrying electric cars: No model key is configured for provider 'Qwen'. Add one under Settings → Model keys (or POST /tenants/self/model-keys). Or allow the run to use Maitento's own key (allowMaitentoFallback). [api:model-keys:none-for-provider]
  Retry 1 of 2 ended Error: No model key is configured for provider 'Qwen'. Add one under Settings → Model keys (or POST /tenants/self/model-keys). Or allow the run to use Maitento's own key (allowMaitentoFallback). [api:model-keys:none-for-provider]
  Retry 2 of 2 ended Error: No model key is configured for provider 'Qwen'. Add one under Settings → Model keys (or POST /tenants/self/model-keys). Or allow the run to use Maitento's own key (allowMaitentoFallback). [api:model-keys:none-for-provider]
```

Three runs, with a two-second pause before the last. Then the app gave up, and its failure says which interaction
failed and why. Without the limit it would have kept starting runs until the app's own `duration.max` stopped it.

It also shows which failures are worth retrying. A missing model key won't fix itself in two seconds, so these retries
only cost time. When a failure ends in an [error code](../../reference/errors.md) for a setting that's wrong, like
`[api:model-keys:none-for-provider]`, give up at once: check for the code with `StringContains` before you retry.
Put the writer's model back.

## If it didn't work

- **The run fails with `ProcessKill failed: Invalid kill request: Process is not running`.** A stop had no `try` of
  its own, and the run it stopped had already ended. Give each `ProcessKill` its own `try`.
- **The app waits much longer than its runs should take.** A run waiting for a person, or for an approval, keeps an
  await waiting until that interaction's own `duration.max`. Give every interaction an app runs a `duration.max`.
- **The run ends `Killed` with `App process exceeded its execution time limit and was terminated`.** Time spent
  waiting for runs counts towards the app's own `duration.max`. Raise it in the app's `.mtr` file.
- **The newsletter runs until it's stopped, and its `headlines` child stays `New`.** No place was free for the child
  to run in while the newsletter waited (see "A parent that waits holds its place" in step 5). Stop the newsletter,
  and run it again when fewer apps are running.
- **The newsletter fails with `The headlines app failed: …`.** The child app failed, and the rest of the message is
  its `failureDetails`. Its run is in the newsletter's **Children**.
- **The run fails with `InteractionStart failed: Interaction 'headline' was not found in namespace …`.** Deploy the
  whole project, so the interactions are there.
- **A headline lands on the wrong topic.** The app matched runs to topics by position. `InteractionAwaitAll` gives
  them back in any order: look each one up by its `id`, as `topicOf` does.
- **Stopping the newsletter left runs going.** Stopping an app doesn't stop the runs it started. Stop them too, from
  the portal's **Runs** or with `ProcessKill`.

## Review

You built:

- `headlines`, which writes headlines in batches of two and retries any run that fails, twice at most;
- `newsletter`, which runs `headlines` as a child, and races two copies of the opener for the first answer;
- scripts that run both and print what they report.

The patterns, and when to reach for each:

| Pattern | Reach for it when | Calls |
|---|---|---|
| Retry, with a limit and a pause | a failure may pass: a timeout, a provider's bad moment | `InteractionStart`, `InteractionAwait`, `Sleep` |
| Batches | a long list, and you need to cap how many run at once | `InteractionStart`, `InteractionAwaitAll` |
| First answer wins | waiting costs more than an extra run | `InteractionAwaitAny`, `ProcessKill` |
| An app starts an app | another app already does part of the job | `AppStart`, `AppProcessAwait` |

The concepts:

- [Run statuses](../../concepts/runs-and-events.md): every await returns when a run ends, `Finished`, `Error` or
  `Killed`, so check the status before you use the output. Retry `Error`; leave `Killed` alone.
- [Apps](../../concepts/apps.md) can start apps: the child is a run of its own, linked under its parent, and stopping
  the parent doesn't stop it.

**Challenge:** batches wait for their slowest run. Swap them for a sliding window: keep two runs going, and start the
next topic as soon as any run ends, with `InteractionAwaitAny`. The solution is in
[`examples/cogniscript-06-patterns/solution`](../../../examples/cogniscript-06-patterns/solution/): a new app,
`headlines-window`, deployed on top of the tutorial's project.

**Next:** that's the Learn Cogniscript track. [17. On a schedule](../17-on-a-schedule.md) runs an app every morning
with an automation, and [22. Code pipelines](../22-code-pipelines.md) puts Cogniscript in a code pipeline's hooks. The
[Cogniscript reference](../../reference/cogniscript/index.md) and the
[system calls](../../reference/cogniscript/system-calls/index.md) have everything else.
