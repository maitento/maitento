---
title: Apps
description: Apps are code that runs on Maitento and orchestrates your agents, tools, files and sandboxes.
sidebar:
  order: 11
---

# Apps

An **app** is code that runs on Maitento. Use one when you need logic *around* your agents: start an
interaction, look at its answer, branch, loop, start several more in parallel, write files, run a
[capsule](capsules.md). Apps are written in [Cogniscript](cogniscript.md), a small C-like language.

See it in [tutorial 16, Apps](../tutorials/16-apps.md), which writes the app below, and
[tutorial 17](../tutorials/17-on-a-schedule.md), which runs it every morning with an [automation](automations.md).
[Tutorial 23](../tutorials/23-support-desk.md#8-the-nightly-digest)'s nightly digest is an app that calls a tool,
saves the day's tickets to a [file system](file-systems.md) and runs a capsule that reports on them.

<!-- snippet: examples/16-apps/maitento/apps/taglines/taglines.mtc -->
```c title="apps/taglines/taglines.mtc"
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

## How an app is laid out

- Each app is a folder under `apps/`, named after the app: `apps/taglines/`.
- It holds one or more `.mtc` files with the code, and optionally one `.mtr` file with settings such as
  `duration.max`.
- An app starts at `main`. **`main`'s parameters are the app's inputs**, so `main(string product)` makes an
  app with one input called `product`.
- **A system call takes every argument**, even the ones you don't need: `InteractionStart`'s last three are there
  even when they're empty. The deploy fails ("Argument count mismatch") when one is missing.

## What an app produces

| Field on the finished run | Comes from |
|---|---|
| `returnValue` | `return(...)` in `main` |
| `outputs` | `AppStateSetOutputString(name, value)`, `AppStateSetOutputJsonArray(...)` and friends |
| `consoleOutputs` | `PrintLine(...)` and `TraceLine(...)` |
| `failureDetails` | an uncaught `throw("...")` (its message), or an error the app didn't catch (`InteractionStart failed: …`, naming the system call) |

## Running one

<!-- tabs -->
```ts
const run = await mt.apps.run("taglines", { inputs: { product: "a reusable bamboo coffee cup" } });
console.log(run.outputs);
```
```python
run = mt.apps.run("taglines", inputs={"product": "a reusable bamboo coffee cup"})
print(run.outputs)
```
```csharp
var run = await mt.Apps.RunAsync("taglines", new Dictionary<string, string> { ["product"] = "a reusable bamboo coffee cup" });
foreach (var output in run.Outputs) Console.WriteLine($"{output.Name}: {output.Value}");
```
```bash
mt app-run taglines --input-product "a reusable bamboo coffee cup"
```
<!-- /tabs -->

`run()` waits for the run. If it ends `Error` or `Killed`, `run()` throws (`ProcessFailedError` in TypeScript and
Python, `MaitentoProcessFailedException` in C#) with the run's `failureDetails`. To get the failed run back instead,
pass `throwOnFailure: false` (`throw_on_failure=False` in Python, `ThrowOnFailure = false` in C#'s `RunOptions`). A
start without one of the app's inputs is refused with `api:apps:input-missing`. See it in
[tutorial 16's break-it step](../tutorials/16-apps.md#break-it-on-purpose).

## The language

Apps are written in Cogniscript, which looks like C but isn't C: every value is text underneath, `7 / 2` is `3.5`,
and `+` adds whenever both sides look like numbers. Read [Cogniscript](cogniscript.md) before you write your first
app, and keep the [language reference](../reference/cogniscript/index.md) to hand. To learn it a step at a time, take
[Learn Cogniscript](../tutorials/cogniscript/index.md).

## The most useful calls

These are [system calls](../reference/cogniscript/system-calls/index.md) from the Maitento library, which only apps
can use, and the standard library's JSON and text calls.

| Area | Calls |
|---|---|
| Interactions | [`InteractionStart`](../reference/cogniscript/system-calls/interactions.md#interactionstart), [`InteractionAwait`](../reference/cogniscript/system-calls/interactions.md#interactionawait), [`InteractionAwaitAll`](../reference/cogniscript/system-calls/interactions.md#interactionawaitall), [`InteractionAwaitAny`](../reference/cogniscript/system-calls/interactions.md#interactionawaitany) |
| Apps | [`AppStart`](../reference/cogniscript/system-calls/apps.md#appstart), [`AppProcessAwait`](../reference/cogniscript/system-calls/apps.md#appprocessawait), [`AppStateSetOutput…`](../reference/cogniscript/system-calls/apps.md#appstatesetoutputstring) |
| Files | [`VfsReadText`](../reference/cogniscript/system-calls/file-systems.md#vfsreadtext), [`VfsWriteText`](../reference/cogniscript/system-calls/file-systems.md#vfswritetext), [`VfsFind`](../reference/cogniscript/system-calls/file-systems.md#vfsfind), [`FileSearch`](../reference/cogniscript/system-calls/files.md#filesearch) |
| Sandboxes | [`CapsuleStart`](../reference/cogniscript/system-calls/sandboxes.md#capsulestart), [`CapsuleExec`](../reference/cogniscript/system-calls/sandboxes.md#capsuleexec), [`CapsuleCommandAwait`](../reference/cogniscript/system-calls/sandboxes.md#capsulecommandawait), [`CapsuleTerminate`](../reference/cogniscript/system-calls/sandboxes.md#capsuleterminate): see [tutorial 21](../tutorials/21-sandboxes.md#4-an-agent-in-the-sandbox) |
| Tools | [`ExtOpInvoke`](../reference/cogniscript/system-calls/tools.md#extopinvoke) |
| JSON | [`JsonObjectCreate`](../reference/cogniscript/system-calls/json.md#jsonobjectcreate), [`JsonObjectGet`](../reference/cogniscript/system-calls/json.md#jsonobjectget), [`JsonObjectSetString`](../reference/cogniscript/system-calls/json.md#jsonobjectsetstring), [`JsonArrayCreate`](../reference/cogniscript/system-calls/json.md#jsonarraycreate), [`JsonArrayAdd`](../reference/cogniscript/system-calls/json.md#jsonarrayadd), [`JsonArrayCount`](../reference/cogniscript/system-calls/json.md#jsonarraycount), [`JsonArrayGetAtIndex`](../reference/cogniscript/system-calls/json.md#jsonarraygetatindex) |
| Text | [`StringToLower`](../reference/cogniscript/system-calls/strings.md#stringtolower), [`StringContains`](../reference/cogniscript/system-calls/strings.md#stringcontains), [`StringToJsonObject`](../reference/cogniscript/system-calls/conversion.md#stringtojsonobject), [`RegexIsMatch`](../reference/cogniscript/system-calls/regex.md#regexismatch) |

## Good to know

- **Child runs use your model keys.** Interactions an app starts run on your tenant's
  [model keys](models-and-keys.md), like any other run.
- **Every input is required** when you start the app, and arrives as text.
- **Tools that need approval don't run from apps.** Approvals happen in interactions.
