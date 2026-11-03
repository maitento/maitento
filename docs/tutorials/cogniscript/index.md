---
title: Learn Cogniscript
description: Six short lessons on the language apps and code pipeline hooks are written in, from values and loops to orchestration patterns.
sidebar:
  label: Overview
  order: 100
---

# Learn Cogniscript

[Tutorial 16](../16-apps.md) wrote a first app: a few lines of Cogniscript that start interactions and collect their
answers. This track teaches the language itself, one idea at a time, so you can write real apps: ones that check their
inputs, work through lists and JSON, recover when something fails, and coordinate many runs at once. Code pipeline
hooks ([tutorial 22](../22-code-pipelines.md#4-check-the-work-a-test-phase-and-a-hook)) are written in the same
language, so everything here applies to them too; only the system calls they can use differ.

It's for developers who have finished Get started and tutorial 16. If you know any language that looks like C
(JavaScript, Java, C#), the syntax will look familiar. The lessons spend their time on what's different: in
Cogniscript, every value is held as text, and that shapes how numbers, comparisons and JSON behave.

## The lessons

Each lesson builds one small app that does something useful, and its output proves the lesson's point.

| # | Lesson | You'll learn |
|---|---|---|
| 1 | [Values and text](1-values.md) | variables and types, text underneath, decimal arithmetic, `+` adding or joining, conversions, string calls, `PrintLine` and `return` |
| 2 | [Decisions and loops](2-decisions-and-loops.md) | comparisons, `&&` `\|\|` `!`, `if` / `else if` / `else`, `for`, `while`, `break` and `continue` |
| 3 | [Functions and files](3-functions.md) | your own functions, parameters and return types, `void`, an app over several `.mtc` files |
| 4 | [JSON in and out](4-json.md) | JSON objects and arrays, reading nested values, JSON inputs, building results, typed named outputs |
| 5 | [When things go wrong](5-errors.md) | `throw`, `try` / `catch`, `GetLastError`, `exit`, checking inputs, what a failed run reports |
| 6 | [Orchestration patterns](6-orchestration.md) | first answer wins, retrying a failed run, an app that starts another app, fan-out in batches |

Take them in order: each one uses what the ones before it taught.

## What you need

- [Get started](../../get-started/index.md) done: an API key in `MAITENTO_API_KEY`, and a namespace in
  `MAITENTO_NAMESPACE` (we use `tutorials`).
- **Lessons 1 to 5 make no AI calls.** Their apps use only the standard library, so they need no model key and cost
  nothing to run.
- **Lesson 6 starts interactions,** so it needs a **DeepSeek** [model key](../../concepts/models-and-keys.md), like
  the main tutorials.

## Running a lesson

Every lesson has a project in [`examples/`](../../../examples/), named after it (`cogniscript-01-values`, …). Its
`maitento/` folder holds the app. Its scripts, in TypeScript, Python and C#, all do the same three things: deploy the
project, run the app with the inputs you give on the command line (or the lesson's, if you give none), and print what
the run reported. The CLI does it in two commands:

<!-- tabs -->
```bash title="TypeScript"
# Node.js 22.18 or later runs TypeScript directly.
cd examples/cogniscript-01-values/typescript
npm install
node receipt.ts
```
```bash title="Python"
# Python 3.10 or later.
cd examples/cogniscript-01-values/python
pip install -r requirements.txt
python receipt.py
```
```bash title="C#"
# The .NET 10 SDK runs a single .cs file directly.
cd examples/cogniscript-01-values/csharp
dotnet run receipt.cs
```
```bash title="CLI"
# The mt command line. Installing it needs the .NET SDK, 8 or later.
cd examples/cogniscript-01-values
mt deploy ./maitento
mt app-run receipt --input-item "Notebook" --input-price "4.5" --input-quantity "3"
```
<!-- /tabs -->

Every script prints the run the same way, so you can compare what you see with the lesson: each line the app printed,
a blank line, `Returned:` and the app's return value, then one `Output "name":` line for each named output it set.

`mt init receipt --example cogniscript-01-values` copies a lesson's project into a new folder, so you don't need the
repository.

Each lesson ends with a challenge. Its solution is in the project's `solution/` folder, as an app of its own with
scripts that run it.

## Looking things up

- [Cogniscript](../../concepts/cogniscript.md): what the language is for, and how it fits with apps and hooks.
- [The Cogniscript language](../../reference/cogniscript/index.md): every keyword, operator and statement.
- [System calls](../../reference/cogniscript/system-calls/index.md): every call an app or hook can make, by area,
  with its parameters and what it returns.

**Start:** [1. Values and text](1-values.md).
