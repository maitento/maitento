---
title: 2. Prompts and inputs
description: Move long text into prompt files, and pass values into the task from your code.
sidebar:
  order: 2
---

# 2. Prompts and inputs

Write a haiku about any topic your code picks when it starts the run. In tutorial 1 the task was fixed text. Real
jobs need values from your code, such as the text to summarise or the customer's question. **Inputs** carry them in.

> **You'll learn**
>
> - how to keep long instructions in Markdown prompt files
> - how to declare inputs, use them in a task, and fill them from your code
> - how to include text only when an optional input has a value
>
> **New concepts:** [inputs](../concepts/interactions.md#inputs) ·
> [prompt files](../concepts/projects-and-deploys.md#the-mtr-format)
>
> **Builds on:** [1. Hello, agent](01-hello-agent.md)
>
> **Time:** ~10 min · **Cost:** under $0.01 on DeepSeek · **Needs:** nothing beyond Get started

## 1. Put the agent's instructions in a prompt file

Text in an `.mtr` file is one line, taken literally. Anything longer than a sentence reads better as Markdown, so it
goes in a file under `prompts/`:

<!-- snippet: examples/02-prompts-and-inputs/maitento/prompts/poet.md -->
```md title="maitento/prompts/poet.md"
You are a poet who writes short, vivid poems.
You only ever reply with the poem itself: no title, no explanation.
```
<!-- /snippet -->

The agent points at it by name with `@prompt("poet")`:

<!-- snippet: examples/02-prompts-and-inputs/maitento/agents/poet.mtr -->
```hcl title="maitento/agents/poet.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = @prompt("poet")
summary = "A poet who writes short poems"
```
<!-- /snippet -->

A deploy copies the file's text into the agent. So when you edit a prompt file, deploy again: the agent only
changes when you do.

## 2. Write the task with inputs

The task is a prompt file too. It uses two inputs:

<!-- snippet: examples/02-prompts-and-inputs/maitento/prompts/haiku-task.md -->
```md title="maitento/prompts/haiku-task.md"
Write a haiku about %%topic%%.
{{#if mood}}
The mood of the haiku should be %%mood%%.
{{/if}}
```
<!-- /snippet -->

- `%%topic%%` is replaced with the value of the input `topic`.
- The `{{#if mood}}` block is only included when `mood` has a value. Without a mood, the task is just the first
  line.

## 3. Declare the inputs

The interaction says which inputs exist, and which ones a run can't start without. Think of them as the job's
parameters: `topic` is required and `mood` is optional.

<!-- snippet: examples/02-prompts-and-inputs/maitento/interactions/one-shot/haiku.mtr -->
```hcl title="maitento/interactions/one-shot/haiku.mtr"
agent = {
  name = "Poet"
  agent = @ref("poet")
}
task = @prompt("haiku-task")
inputs.prompts = [
  {
    name = "topic"
    description = "What the haiku is about"
    required = true
  },
  {
    name = "mood"
    description = "Optional mood, for example calm or playful"
    required = false
  }
]
```
<!-- /snippet -->

Inputs are only filled in in the interaction's `task`. Written in the agent's prompt, `%%topic%%` would stay as it
is. That keeps the agent reusable: it says *how* to write, and the task says *what* to write this time.

**Done when:** your project has four files: `agents/poet.mtr`, `interactions/one-shot/haiku.mtr`,
`prompts/poet.md` and `prompts/haiku-task.md`.

## 4. Run it with values

Pass the inputs by name when you start the run:

<!-- tabs -->
<!-- snippet: examples/02-prompts-and-inputs/typescript/haiku.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// The interaction declares two inputs: topic (required) and mood (optional).
const run = await mt.interactions.run("haiku", {
  inputs: { topic: "autumn rain", mood: "calm" },
});
console.log(run.output);
```
<!-- /snippet -->
<!-- snippet: examples/02-prompts-and-inputs/python/haiku.py -->
```python title="Python"
from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# The interaction declares two inputs: topic (required) and mood (optional).
run = mt.interactions.run("haiku", inputs={"topic": "autumn rain", "mood": "calm"})
print(run.output)
```
<!-- /snippet -->
<!-- snippet: examples/02-prompts-and-inputs/csharp/haiku.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// The interaction declares two inputs: topic (required) and mood (optional).
var run = await mt.Interactions.RunAsync("haiku", new Dictionary<string, string>
{
    ["topic"] = "autumn rain",
    ["mood"] = "calm",
});
Console.WriteLine(run.Output);
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt interaction-run haiku --input-topic "autumn rain" --input-mood calm
```
<!-- /tabs -->

Run it from the language's folder in [`examples/02-prompts-and-inputs`](../../examples/02-prompts-and-inputs/):

<!-- tabs -->
```bash title="TypeScript"
cd examples/02-prompts-and-inputs/typescript
npm install
node haiku.ts
```
```bash title="Python"
cd examples/02-prompts-and-inputs/python
pip install -r requirements.txt
python haiku.py
```
```bash title="C#"
cd examples/02-prompts-and-inputs/csharp
dotnet run haiku.cs
```
```bash title="CLI"
cd examples/02-prompts-and-inputs
mt deploy ./maitento
mt interaction-run haiku --input-topic "autumn rain" --input-mood calm
```
<!-- /tabs -->

**Done when:** a three-line haiku about autumn rain is printed, with no title and nothing else, as the poet's prompt
asks:

```text
Cold drops on bare branch,
the last leaf lets go and falls—
quiet grey morning.
```

Now take `mood` out of the inputs and run it again. You still get a haiku: the `{{#if mood}}` line was left out of
the task.

## All the files

<!-- project: examples/02-prompts-and-inputs -->
**On GitHub:** [`examples/02-prompts-and-inputs`](https://github.com/maitento/maitento/tree/main/examples/02-prompts-and-inputs) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/02-prompts-and-inputs/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/02-prompts-and-inputs/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/02-prompts-and-inputs/csharp)

<details>
<summary>All the files in this project (4)</summary>

<!-- tabs: files -->
**`maitento/agents/poet.mtr`**
```hcl title="maitento/agents/poet.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = @prompt("poet")
summary = "A poet who writes short poems"
```

**`maitento/interactions/one-shot/haiku.mtr`**
```hcl title="maitento/interactions/one-shot/haiku.mtr"
agent = {
  name = "Poet"
  agent = @ref("poet")
}
task = @prompt("haiku-task")
inputs.prompts = [
  {
    name = "topic"
    description = "What the haiku is about"
    required = true
  },
  {
    name = "mood"
    description = "Optional mood, for example calm or playful"
    required = false
  }
]
```

**`maitento/prompts/haiku-task.md`**
```md title="maitento/prompts/haiku-task.md"
Write a haiku about %%topic%%.
{{#if mood}}
The mood of the haiku should be %%mood%%.
{{/if}}
```

**`maitento/prompts/poet.md`**
```md title="maitento/prompts/poet.md"
You are a poet who writes short, vivid poems.
You only ever reply with the poem itself: no title, no explanation.
```
<!-- /tabs -->

</details>

<!-- /project -->

## Break it on purpose

Leave out the required input: start the run with only `mood`. Maitento refuses the run before it starts, and names
the input:

<!-- tabs -->
```text title="TypeScript"
ValidationError: PUT /namespaces/tutorials/interactions/by-name/haiku/start failed with 400 (api:interactions:input-required): Interaction 'haiku' requires input for topic
```
```text title="Python"
maitento.errors.ValidationError: 400 Bad Request: inputs: Interaction 'haiku' requires input for topic (PUT https://api.maitento.com/namespaces/tutorials/interactions/by-name/haiku/start)
```
```text title="C#"
Unhandled exception. Maitento.Sdk.Exceptions.MaitentoValidationException: Validation failed: inputs: Interaction 'haiku' requires input for topic
```
```text title="CLI"
Option '--input-topic' is required.

Required parameters based on your input:
  --input-topic: Interaction input: topic (Required)
  --input-mood: Interaction input: mood (Optional)
```
<!-- /tabs -->

No run was created, so nothing was spent. Marking an input `required` is how an interaction protects itself from a
half-filled job. The CLI goes one step further: it reads the interaction's inputs and checks them before it calls
Maitento.

## If it didn't work

- **`does not support input for mod`**: an input name is misspelled in your code (`mod` for `mood`). Names must match
  the interaction's `inputs.prompts` exactly.
- **`Prompt file haiku_task not found (haiku.mtr:5)`**: a `@prompt("...")` name doesn't match a file under
  `prompts/`. The name is the file name without `.md`.
- **The answer ignores an input**: its `%%name%%` is in the agent's prompt, not the task. Inputs are only filled in
  in the interaction's `task`; anywhere else the model reads the literal text `%%topic%%`.
- **You changed a prompt file and nothing changed**: deploy again. The text is copied in at deploy time.
- **`No namespace`**, **`Project folder not found: ../maitento`**, **`[api:model-keys:none-for-provider]`**: see
  [tutorial 1](01-hello-agent.md#if-it-didnt-work).

## Review

You built:

- a poet agent whose instructions live in a Markdown prompt file;
- a task with a required input and an optional one, filled in from your code;
- a task line that only appears when its input has a value.

The concepts:

- [Prompt files](../concepts/projects-and-deploys.md#the-mtr-format): `@prompt("name")` reads `prompts/name.md`, and
  copies it in at deploy time.
- [Inputs](../concepts/interactions.md#inputs): the job's parameters. `%%name%%` in the task, `{{#if name}}` for
  optional text, `required` to refuse a run without it.

**Challenge:** add a third, optional input, `language`. When it's set, the haiku is written in that language; when
it isn't, nothing changes. Run it with `language` set to Portuguese. The solution is in
[`examples/02-prompts-and-inputs/solution`](../../examples/02-prompts-and-inputs/solution/).

**Next:** [3. Typed answers](03-typed-answers.md) gets JSON back instead of prose.
