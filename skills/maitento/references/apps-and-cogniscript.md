# Apps and Cogniscript

An **app** is code that runs on Maitento, next to your agents. Use one when you need logic *around* agents that must
happen the same way every time: start interactions, check their answers, branch, loop, run several at once, write
files, run a sandbox. Apps, and code pipeline hooks, are written in **Cogniscript**, Maitento's own small C-like
language.

Concept pages: `docs/concepts/apps.md`, `docs/concepts/cogniscript.md`. The full language:
`docs/reference/cogniscript/index.md`. Every system call, with what it takes and returns:
`docs/reference/cogniscript/system-calls/index.md` (machine-readable: `sdks/cogniscript.json`). To learn it a step at a
time: `docs/tutorials/cogniscript/index.md`, with code in `examples/cogniscript-01-values/` onwards.

## An app

- An app is a folder under `apps/`, named after the app: `apps/taglines/`. Every `.mtc` file in it, sub-folders
  included, is one program. An optional `.mtr` beside the code holds settings: `duration.max`, `functions.openApi`,
  `credentialStack`.
- It starts at `main`. **`main`'s parameters are the app's inputs**, every one is required, and each arrives as
  text.
- It runs only what Maitento lets it: no files, network or clock of its own. It reaches the world through system
  calls, each working inside your tenant.

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

What the finished run carries:

| Field | Comes from |
|---|---|
| `returnValue` | `return(...)` in `main` |
| `outputs` | `AppStateSetOutputString(name, value)`, `AppStateSetOutputJsonArray(name, value)` and the other `AppStateSetOutput…` calls |
| `consoleOutputs` | `PrintLine(...)` and `TraceLine(...)` |
| `failureDetails` | an uncaught `throw("...")`, or `CallName failed: …` for a system call that failed |

Run it with `mt app-run taglines --input-product "a reusable bamboo coffee cup"` or `mt.apps.run(...)` in an SDK. A
start without one of the inputs is refused with `api:apps:input-missing`. Example: `examples/16-apps/`.

## Cogniscript: the rules that catch people out

It looks like C. It isn't:

- **Every value is text underneath.** Types (`string`, `int`, `decimal`, `bool`, `guid`, `date`, `jsonObject`,
  `jsonArray`, and `void` for no result) are labels, not checked or converted.
- **Arithmetic is decimal:** `7 / 2` is `3.5`. There is no integer division.
- **`+` adds whenever both sides look like numbers**, text included: `"10" + "20"` is `30`. Join text that might
  look like numbers (ids, lists you build) with `StringConcatenate(first, second)`.
- **`==` compares text exactly**, case and all: `"Finished" == "finished"` is false, and `1 == 1.0` is false.
  `<` and `>` compare numbers only.
- **System calls take every argument**, even ones you don't need: pass `""` or `"[]"`. A missing one fails the
  deploy with "Argument count mismatch for <call>".
- **JSON calls return a new value: assign it back.** `order = JsonObjectSetString(order, "status", "paid");`
- **There's no `null`.** A missing JSON key reads as `""`.
- **`return`, `exit` and `throw` take brackets:** `return(x)`. **Braces are required** on every `if`, `else`,
  `for`, `while`, `try` and `catch` body.
- **Every variable is declared with a value:** `int count = 0;`. No shadowing, no globals, no overloading, no
  default arguments, no underscores in names.
- **No `switch`, `do … while`, `catch (e)`, `finally`, `/* */` comments or single quotes.** `try { } catch { }`
  catches any error, and `GetLastError()` says what it was.
- **Backslashes are doubled** when they aren't an escape: `"\\d"` in a regular expression. `"\d"` fails the deploy.
- **A function that should return a value and doesn't stops the run.**

## The system calls you'll use most

| Area | Calls |
|---|---|
| interactions | `InteractionStart(name, inputs, loomMappings, aiModelOverrides, responseJsonSchema)` returns the run id; `InteractionAwait(id)` returns the finished run; `InteractionAwaitAll(ids)`, `InteractionAwaitAny(ids)` |
| apps | `AppStart(name, inputs)`, `AppProcessAwait(id)`, `AppStateSetOutputString(name, value)` |
| tools | `ExtOpInvoke(name, request, queryParams, pathParams, secretId)`: no approvals from apps, so a tool that needs one fails |
| files | `VfsReadText(vfsName, namespaceName, path)`, `VfsWriteText(vfsName, namespaceName, path, content)`, `FileSearch(partitionId, query)` |
| sandboxes | `CapsuleStart(name, namespaceName, vfsMounts, secretMounts, commands)`, `CapsuleExec(processId, command, arguments, runAsUser, maximumDurationMs, async)`, `CapsuleCommandAwait(processId, commandId)`, `CapsuleTerminate(processId)` |
| JSON | `JsonObjectCreate()`, `JsonObjectGet(obj, key)`, `JsonObjectSetString(obj, key, value)`, `JsonArrayCreate()`, `JsonArrayAdd(array, value)`, `JsonArrayCount(array)`, `JsonArrayGetAtIndex(array, index)` |
| text | `StringTrim(value)`, `StringContains(value, search, ignoreCase)`, `StringToJsonObject(value)`, `RegexIsMatch(input, pattern)` |

A started run's object has `status`, `output` and `failureDetails`, read with `JsonObjectGet`. Check
`status == "Finished"` before you use `output`.

## Checking and running Cogniscript

- The offline `.mtr` checker doesn't read `.mtc`. `mt build ./maitento` compiles every app and hook and reports
  mistakes with the file and line: `(taglines.mtc Ln: 13 Chr: 25) Argument count mismatch for InteractionStart`.
- Mistakes that only show when the code runs (a value that isn't a number, a missing variable, a failing system
  call) end the run `Error`, with the reason in `failureDetails`.
- An app's `duration.max` (none unless set) ends it `Killed`; time spent waiting for runs it started counts. A `try`
  can't catch a time limit or a stop.
- Interactions an app starts run on the tenant's model keys like any other run, and show as the app run's children.

## Code pipeline hooks

Hooks are Cogniscript too, in `code-pipeline-hooks/<pipeline>/*.mtc`: every function there takes
`(string processId, string methodName)` and returns text, there is no `main`, and they use the standard library plus
the hook calls (`PipelineGetVariable`, `PipelineSetVariable`, `PipelineLog`, …) instead of the Maitento library. See
[code pipelines](code-pipelines.md#hooks).
