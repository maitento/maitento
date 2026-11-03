---
title: Cogniscript
description: Cogniscript is the small C-like language for apps and code-pipeline hooks, deployed and versioned with your agents.
sidebar:
  order: 11.5
---

# Cogniscript

**Cogniscript** is Maitento's own small language. It looks like C: functions, `if`, `for`, `while`, braces and
semicolons. You write two things in it, in `.mtc` files in your project: [apps](apps.md), and the hooks of
[code pipelines](code-pipelines.md#hooks-what-happens-next).

See it in [tutorial 16, Apps](../tutorials/16-apps.md), whose app brainstorms three ideas and then writes a tagline
for each, all at once. To learn the language itself, take [Learn Cogniscript](../tutorials/cogniscript/index.md).

## Why a language of its own

An agent is good at deciding what a prompt can decide. Much of a real job isn't like that: start these five runs,
wait for them, keep the ones that finished, try again once if one failed, stop after ten minutes. That logic should
do the same thing every time, so it belongs in code rather than in a prompt. Cogniscript is that code, and it lives
with your agents:

- **It runs on Maitento, next to your agents.** Your own program starts an app and can go away. The app keeps going,
  and its run records everything it did, with every run it started linked to it.
- **It's deployed and versioned with your agents.** An app is part of your project, so one deploy ships the agents,
  the interactions and the code that uses them, and a deploy that changes the code makes a new version.
- **It's small, and it can only do what Maitento lets it.** A program has no files, network or clock of its own. It
  reaches the world through [system calls](#system-calls), each working inside your tenant: start an interaction,
  read a file system, run a command in a sandbox.

## Where it runs

| | An app | A code-pipeline hook |
|---|---|---|
| Lives in | `apps/<app>/*.mtc` | `code-pipeline-hooks/<pipeline>/*.mtc` |
| Starts at | `main` | the hook a phase or a step names, such as `"postHook": "TestGate"` |
| Is given | `main`'s parameters: the app's inputs, as text | `processId` and `methodName` |
| Gives back | `return(...)` in `main`: the run's `returnValue`, plus named outputs | `return(...)`: its decision for the pipeline |
| System calls | the [standard library](../reference/cogniscript/system-calls/index.md#standard-library) and the [Maitento library](../reference/cogniscript/system-calls/index.md#maitento) | the [standard library](../reference/cogniscript/system-calls/index.md#standard-library) and the [hook calls](../reference/cogniscript/system-calls/index.md#code-pipeline-hooks) |
| Time limit | the app's `duration.max`, if you set one | 30 seconds, or the pipeline's `hookDurationLimit` |

Every `.mtc` file in the folder, sub-folders included, is part of one program, so you can split a long app over
several files.

## The shape of a program

A program is functions, and nothing else. An app's `main` is where it starts, and its parameters are the app's
inputs. Functions can be in any order and in any of the files:

<!-- cogniscript: program -->
```c
// An app with one input, name. It greets the name, three times over.
string main(string name) {
	if (StringTrim(name) == "") {
		throw("Tell me who to greet.");
	}
	string greeting = greet(name);
	for (int i = 1; i <= 3; i++) {
		PrintLine(i + ". " + greeting);
	}
	return(greeting);
}

// A function of your own: its return type, its name, then its parameters.
string greet(string name) {
	return("Hello, " + name + "!");
}
```
<!-- cogniscript: output name="Ada" -->
```text
1. Hello, Ada!
2. Hello, Ada!
3. Hello, Ada!
```

- **Every variable has a type and starts with a value:** `int count = 0;`.
- **`return`, `exit` and `throw` take brackets:** `return(greeting)`. `throw(...)` ends the run with an error, whose
  message becomes the run's `failureDetails`.
- **`PrintLine` writes to the run's console**, which you read back as its `consoleOutputs`, or in the portal's
  **Runs**.

## System calls

A **system call** is a function built into Cogniscript, such as `StringTrim` or `PrintLine` above. You call one
exactly as you call your own functions. The [standard library](../reference/cogniscript/system-calls/index.md#standard-library)
handles text, numbers, JSON, dates and the console. The [Maitento library](../reference/cogniscript/system-calls/index.md#maitento)
starts and waits for interactions, apps, sandboxes and code pipelines, calls tools, and reads and writes files,
knowledge bases and memory.

**A system call takes every argument it has**, even the ones you don't need. Pass `""` or `"[]"` for those. Every call,
with what it takes and returns, is in [System calls](../reference/cogniscript/system-calls/index.md).

## How it's checked

Your code is compiled when you validate the project (`mt build`, or **Validate** in the portal's **Build studio**)
and when you deploy it. A mistake, such as a missing `;`, a call to something that doesn't exist or a call with the
wrong number of arguments, stops the deploy, and is reported with its file and line:

```text
<10:41:07.512> [ERR] (taglines.mtc Ln: 13 Chr: 25) Argument count mismatch for InteractionStart
```

Some mistakes can only show when the code runs: a value that isn't a number where one is needed, a variable that
doesn't exist, a system call that fails. Those stop the run with status `Error`, and its `failureDetails` say what
went wrong, such as `InteractionStart failed: …`. A `try { } catch { }` catches them if you'd rather carry on.

## Cogniscript in five minutes

These are the things that catch people out, so they're worth five minutes before you write your first app:

<!-- cogniscript: program -->
```c
string main() {
	// Every value is text underneath. A type is a label: half holds 3.5.
	int half = 7 / 2;
	PrintLine(half);

	// + adds when both sides look like numbers, and joins everything else.
	PrintLine("Order " + 42);
	PrintLine("10" + "20");
	PrintLine(StringConcatenate("10", "20"));

	// == compares the text exactly, case and all.
	PrintLine("Finished" == "finished");

	// The JSON calls return a new value: assign it back.
	jsonObject order = JsonObjectCreate();
	order = JsonObjectSetString(order, "status", "paid");
	PrintLine(JsonObjectGet(order, "status"));

	// try / catch catches any error, and GetLastError() says what it was.
	try {
		int amount = StringToInt("twelve");
	} catch {
		PrintLine("Caught: " + GetLastError());
	}
	return("done");
}
```
<!-- cogniscript: output -->
```text
3.5
Order 42
30
1020
False
paid
Caught: Cannot convert 'twelve' to integer
```

- **Types:** `string`, `int`, `decimal`, `bool`, `guid`, `date`, `jsonObject` and `jsonArray`, and `void` for a
  function that returns nothing. Every value is held as text, and Maitento doesn't check or convert it to the type you
  wrote, so treat types as notes for whoever reads the code.
- **Arithmetic is decimal:** `7 / 2` is `3.5`, and `1.5 * 2` is `3.0`.
- **`+` adds or joins, depending on the values it gets when it runs.** To join text that might look like numbers, such
  as ids or a list you're building, use [`StringConcatenate`](../reference/cogniscript/system-calls/strings.md#stringconcatenate).
- **`&&` and `||` stop as soon as they know the answer**, as in C, so `count > 0 && JsonArrayGetAtIndex(items, 0) == "x"`
  is safe on an empty list.
- **Braces are required** around every `if`, `else`, `for`, `while`, `try` and `catch` body.
- **Backslashes need doubling in text** when they aren't an escape: `"\\d"` in a regular expression, `"C:\\temp"` in a
  path. `"\d"` fails the deploy.
- **There's no `null`.** A missing JSON key reads as empty text, `""`.

The [Cogniscript language](../reference/cogniscript/index.md) reference has every rule, and all the places where
Cogniscript does something you might not expect.

## Where to go next

- **Have a coding agent write it:** agents haven't seen Cogniscript before, so give yours the Maitento skill first.
  See [Build with an AI coding agent](../guides/ai-coding-agents.md).
- **Learn it:** [Learn Cogniscript](../tutorials/cogniscript/index.md) teaches the language one idea at a time:
  values, decisions and loops, functions, JSON, errors and orchestration patterns. The first five lessons cost
  nothing to run.
- **Look something up:** the [language reference](../reference/cogniscript/index.md), and the
  [system calls](../reference/cogniscript/system-calls/index.md).
- **See it at work in the tutorials:**
  - [16. Apps](../tutorials/16-apps.md) runs several interactions at once and collects their answers;
  - [17. On a schedule](../tutorials/17-on-a-schedule.md) runs that app every morning with an [automation](automations.md);
  - [21. Sandboxes](../tutorials/21-sandboxes.md#4-an-agent-in-the-sandbox) loops between an agent and a
    [capsule](capsules.md);
  - [22. Code pipelines](../tutorials/22-code-pipelines.md#4-check-the-work-a-test-phase-and-a-hook) writes a hook
    that sends failing work back to the developer;
  - [23. Support desk](../tutorials/23-support-desk.md#8-the-nightly-digest) has a nightly digest app that calls a
    tool, writes to a [file system](file-systems.md) and runs a capsule.
