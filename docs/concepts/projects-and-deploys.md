---
title: Projects and deploys
description: How a folder of small text files becomes agents, interactions and tools you can run.
sidebar:
  order: 1
---

# Projects and deploys

A Maitento **project** is a folder. Each kind of definition has its own sub-folder, and the **file name is the
definition's name**: `agents/greeter.mtr` defines the agent `greeter`.

![A maitento project folder, where the file name is the definition's name: agents/greeter.mtr is the agent "greeter". Its folders: agents/; interactions/ with one-shot/, round-robin/ or managed/; connectors/open-api/ for the HTTP endpoints your tools call; external-operations/open-api/ for the tools agents see; apps/ with a folder per app holding name.mtc and an optional .mtr; capsules/; looms/ for memory; code-pipelines/ with a folder per pipeline holding pipeline-definition.json; prompts/ for long text read with @prompt("name"); json/ for JSON Schemas read with @json("name").](../assets/diagrams/project-layout.svg)

Sub-folders inside these are fine. Anything else in the project folder, such as a README, is ignored.

## The `.mtr` format

Definitions are written in `.mtr` files: one `name = value` per line.

<!-- snippet: examples/01-hello-agent/maitento/agents/greeter.mtr -->
```hcl title="agents/greeter.mtr"
// The model this agent runs on. See the names you can use with `mt aimodel-list`.
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a friendly assistant. Keep every answer to one or two sentences."
summary = "A friendly assistant"
```
<!-- /snippet -->

What you can write as a value:

| Value | Example |
|---|---|
| Text | `"You are a friendly assistant."` |
| Number or true/false | `3`, `true` |
| A block of properties | `agent = { name = "Greeter" agent = @ref("greeter") }` |
| A list | `["git", "curl"]` (commas between items) |
| Another definition | `@ref("greeter")`, or `@ref("greeter", "other-namespace")` |
| A file from `prompts/` | `@prompt("poet")` reads `prompts/poet.md`, as in [tutorial 2](../tutorials/02-prompts-and-inputs.md) |
| A file from `json/` | `@json("recipe")` reads `json/recipe.json` |
| A comment | `// anything after two slashes` |

Rules that catch people out:

- **Put spaces around `=`.** `task="x"` does not parse; `task = "x"` does.
- **Text in `.mtr` files is taken literally.** `\n` stays as a backslash and an `n`. Put anything longer than a
  sentence in a `prompts/*.md` file and use `@prompt(...)`.
- **A list can't be empty.** Leave the property out instead.
- **Prompt and JSON files are found by name**, wherever they sit under `prompts/` and `json/`, so keep their names
  unique.

Every kind of file and every property it can set is listed in the [project-file reference](../reference/project-files/index.md),
and the [VS Code extension](../../editors/vscode/) completes and checks `.mtr` files as you type. A coding agent
such as Claude Code or Codex can write them too, once it has the [Maitento skill](../guides/ai-coding-agents.md).

## Validate, then deploy

Sending a project to Maitento is a **build**. A build compiles every file, checks every `@ref`, and then either
throws the result away (**validate**) or saves it (**deploy**). Nothing is half-saved: if any file has an error,
nothing changes.

**Deploying needs a tenant admin.** What you deploy runs with your tenant's own rights: an app can do anything its
system calls allow, whoever starts it. So only an admin can deploy, from any of the places below, and anyone else is
refused with a 403, code `api:builds:deploy-requires-admin`. Every member can validate.

You can build from three places:

<!-- tabs -->
```ts
import { Maitento } from "@maitento/sdk";

const mt = new Maitento({ namespace: "hello-maitento" });
await mt.validate("./maitento"); // check only
await mt.deploy("./maitento");   // save
```
```python
from maitento import Maitento

mt = Maitento(namespace="hello-maitento")
mt.validate("./maitento")  # check only
mt.deploy("./maitento")    # save
```
```csharp
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.ValidateAsync("./maitento", "hello-maitento"); // check only
await mt.DeployAsync("./maitento", "hello-maitento");   // save
```
```bash
mt ns-set hello-maitento
mt build ./maitento     # check only
mt deploy ./maitento    # save
```
<!-- /tabs -->

The third place is the portal's **Build studio**, which has an editor with the same folder layout, and
**Validate** and **Deploy** buttons. Errors link to the file and line.

See it in [tutorial 1, Hello, agent](../tutorials/01-hello-agent.md#4-what-the-deploy-did), which deploys its first
project and then [breaks a reference on purpose](../tutorials/01-hello-agent.md#break-it-on-purpose): the deploy
names the file and saves nothing.

## Versions

Every definition keeps its history. A deploy that changes a definition adds a new version, and a deploy where
nothing changed reports it as **Unchanged**. A new run uses the newest version.

To go back to an earlier version, deploy its files again. The deploy adds them as a new version, so new runs use
them, and the versions in between stay in the history.

When an interaction uses an agent, it is tied to the agent version that existed when the interaction was deployed.
Deploy the whole folder after you change an agent, and the interaction picks up the new version.

## Deploys only add

A deploy creates and updates. It **never deletes**: removing a file from your folder does not remove the
definition. Delete definitions in the portal, with the SDK, or with the `mt` `*-delete` commands.

## What isn't deployed

A few things hold data rather than describe behaviour, so you create them directly through the portal, the SDK or
the CLI, not with a deploy:

- [secrets](secrets.md)
- [virtual file systems](file-systems.md) and [knowledge bases](knowledge.md)
- [webhooks](runs-and-events.md#3-get-called-back-webhooks)
- [automations](automations.md)
- API keys and [model keys](models-and-keys.md)
