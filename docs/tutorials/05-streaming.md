---
title: 5. Watch it think
description: Stream an agent's reply word by word as the model writes it.
sidebar:
  order: 5
---

# 5. Watch it think

Ask for a 200-word bedtime story and show it as it's written. A long answer takes the model a few seconds or more;
with `run()` alone, your user stares at nothing until the last word. Streaming shows the first words in about a
second, the way a chat app does.

> **You'll learn**
>
> - how to receive the reply a few words at a time, as the model writes it
> - what Maitento's live event stream is, and how `run()` uses it
> - why the finished run, not the stream, is the record
>
> **New concepts:** [live events](../concepts/runs-and-events.md#2-watch-it-live)
>
> **Builds on:** [2. Prompts and inputs](02-prompts-and-inputs.md)
>
> **Time:** ~10 min · **Cost:** under $0.01 on DeepSeek · **Needs:** nothing beyond Get started

## 1. Write the storyteller

An agent with a gentle voice:

<!-- snippet: examples/05-streaming/maitento/agents/storyteller.mtr -->
```hcl title="maitento/agents/storyteller.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a gentle storyteller for young children."
summary = "Tells short stories"
```
<!-- /snippet -->

And a one-shot interaction that asks it for a story about a subject your code chooses. The task is one sentence, so
it is written in the `.mtr` file rather than a prompt file:

<!-- snippet: examples/05-streaming/maitento/interactions/one-shot/story.mtr -->
```hcl title="maitento/interactions/one-shot/story.mtr"
agent = {
  name = "Storyteller"
  agent = @ref("storyteller")
}
task = "Tell a bedtime story of about 200 words about %%subject%%."
inputs.prompts = [
  {
    name = "subject"
    description = "Who or what the story is about"
    required = true
  }
]
```
<!-- /snippet -->

Nothing here is about streaming. Any interaction can be streamed: it's your code that chooses to listen.

## 2. Stream the run

Maitento sends **events** over one WebSocket as your runs change, including each piece of the reply as the model
writes it. The script passes `run()` a callback, `onToken`, that receives each piece of text. Because it does,
`run()` opens that connection for the run:

<!-- tabs -->
<!-- snippet: examples/05-streaming/typescript/story.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// onToken gets the story word by word, as it's written: run() opens Maitento's live event stream for it.
const run = await mt.interactions.run("story", { inputs: { subject: "a hedgehog who is afraid of the dark" } }, {
  onToken: (text) => process.stdout.write(text),
});

// The streamed text was for showing progress. The finished run is the record.
console.log(`\n\n[${run.status}: the output has ${run.output?.length ?? 0} characters]`);

await mt.close();
```
<!-- /snippet -->
<!-- snippet: examples/05-streaming/python/story.py -->
```python title="Python"
from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# on_token gets the story word by word, as it's written: run() opens Maitento's live event stream for it.
run = mt.interactions.run(
    "story",
    inputs={"subject": "a hedgehog who is afraid of the dark"},
    on_token=lambda text, agent: print(text, end="", flush=True),
)

# The streamed text was for showing progress. The finished run is the record.
print(f"\n\n[{run.status}: the output has {len(run.output or '')} characters]")

mt.close()
```
<!-- /snippet -->
<!-- snippet: examples/05-streaming/csharp/story.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Interactions;
using Maitento.Sdk;
using Maitento.Sdk.Runs;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// OnToken gets the story word by word, as it's written: RunAsync opens Maitento's live event stream for it.
var inputs = new Dictionary<string, string> { ["subject"] = "a hedgehog who is afraid of the dark" };
var run = await mt.Interactions.RunAsync("story", inputs, new RunOptions<InteractionProcess>
{
    OnToken = (text, agent) => Console.Write(text),
});

// The streamed text was for showing progress. The finished run is the record.
Console.WriteLine($"\n\n[{run.Status}: the output has {run.Output?.Length ?? 0} characters]");
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt interaction-run story --input-subject "a hedgehog who is afraid of the dark" --stream true
```
<!-- /tabs -->

The callback also gets the name of the agent that is writing, which matters once several agents share a run
([tutorial 6](06-routed-agents.md) onwards).

Run it from the language's folder in [`examples/05-streaming`](../../examples/05-streaming/):

<!-- tabs -->
```bash title="TypeScript"
cd examples/05-streaming/typescript
npm install
node story.ts
```
```bash title="Python"
cd examples/05-streaming/python
pip install -r requirements.txt
python story.py
```
```bash title="C#"
cd examples/05-streaming/csharp
dotnet run story.cs
```
```bash title="CLI"
cd examples/05-streaming
mt deploy ./maitento
mt interaction-run story --input-subject "a hedgehog who is afraid of the dark" --stream true
```
<!-- /tabs -->

**Done when:** the story appears a few words at a time, and the last line, read from the finished run, says
`Finished`:

```text
Once upon a time, in a cozy burrow beneath an old oak tree, lived a little hedgehog named Pip. Pip loved the daytime, when the sun warmed his prickly back and he could scurry through the leaves. But when the sky turned purple and the stars peeked out, Pip felt a flutter of worry in his tummy.

…
And curled up warm and snug, Pip drifted off, unafraid.

[Finished: the output has 1220 characters]
```

## 3. What happened

- `run()` opened one WebSocket to Maitento, because you passed `onToken`. Every change to your runs comes over it,
  including the reply text as it's written (the `interaction-process-stream` event).
- `run()` started the run and passed each piece of reply text to your callback.
- `run()` also used the connection to follow the run, so it heard straight away that the run had finished, instead
  of checking every few seconds. Then it closed the connection.
- The finished run came back as usual, with the whole story in `output`.

To keep one connection open for many runs, or to hear about other events, open it yourself before you run:
`mt.events.connect()` (`mt.Notifications.StartAsync()` in C#). `run()` then uses yours, with or without `onToken`, and
leaves it open. [Tutorial 12](12-live-events.md) does that.

**Streamed text is for showing progress; the finished run is the record.** Events are best effort: if the
connection drops for a moment, some streamed text may be lost, but the run and its `output` are always complete.
Show the stream while it comes, and store `output`.

## All the files

<!-- project: examples/05-streaming -->
**On GitHub:** [`examples/05-streaming`](https://github.com/maitento/maitento/tree/main/examples/05-streaming) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/05-streaming/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/05-streaming/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/05-streaming/csharp)

<details>
<summary>All the files in this project (2)</summary>

<!-- tabs: files -->
**`maitento/agents/storyteller.mtr`**
```hcl title="maitento/agents/storyteller.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a gentle storyteller for young children."
summary = "Tells short stories"
```

**`maitento/interactions/one-shot/story.mtr`**
```hcl title="maitento/interactions/one-shot/story.mtr"
agent = {
  name = "Storyteller"
  agent = @ref("storyteller")
}
task = "Tell a bedtime story of about 200 words about %%subject%%."
inputs.prompts = [
  {
    name = "subject"
    description = "Who or what the story is about"
    required = true
  }
]
```
<!-- /tabs -->

</details>

<!-- /project -->

## Break it on purpose

Tell `run()` to stop waiting after three seconds, long before the story is done. Add a timeout next to the callback:

<!-- tabs -->
```ts title="TypeScript"
const run = await mt.interactions.run("story", { inputs: { subject: "a hedgehog who is afraid of the dark" } }, {
  onToken: (text) => process.stdout.write(text),
  timeout: 3000, // milliseconds
});
```
```python title="Python"
run = mt.interactions.run(
    "story",
    inputs={"subject": "a hedgehog who is afraid of the dark"},
    on_token=lambda text, agent: print(text, end="", flush=True),
    timeout=3,  # seconds
)
```
```csharp title="C#"
var run = await mt.Interactions.RunAsync("story", inputs, new RunOptions<InteractionProcess>
{
    OnToken = (text, agent) => Console.Write(text),
    Timeout = TimeSpan.FromSeconds(3),
});
```
<!-- /tabs -->

Run it again. The story starts, stops partway through, and `run()` throws a timeout error instead of returning the run
(if the run was slow to start, you see only the error):

<!-- tabs -->
```text title="TypeScript"
Once upon a time, in a cozy burrow beneath an old oak tree, lived a little hedgehog named Pip. Pip loved
TimeoutError: Interaction run 6422bf07-1913-4e6c-8a42-391b49d42f11 did not finish within 3s.
```
```text title="Python"
Once upon a time, in a cozy burrow beneath an old oak tree, lived a little hedgehog named Pip. Pip loved
maitento.errors.TimeoutError: Interaction run 6422bf07-1913-4e6c-8a42-391b49d42f11 did not finish within 3s.
```
```text title="C#"
Once upon a time, in a cozy burrow beneath an old oak tree, lived a little hedgehog named Pip. Pip loved
Unhandled exception. Maitento.Sdk.Exceptions.MaitentoRunTimeoutException: Interaction run 6422bf07-1913-4e6c-8a42-391b49d42f11 did not finish within 3s.
```
<!-- /tabs -->

Only your script stopped watching. The run itself carried on: open it in the portal's **Runs** page, or with
`mt interaction-attach <run id>`, and it's `Finished`, with the whole story in its output. A timeout stops the run
too only when you ask for that (`killOnAbort: true`, `kill_on_abort=True`, `KillOnCancel = true`).

That's the stream's place in one picture: lose the stream and you lose the show, not the result.

## If it didn't work

- **TypeScript or Python: a warning that the event stream could not be opened, then the story all at once**: the
  connection failed, so `run()` checked on the run every few seconds instead and nothing streamed. On Node 20, which
  has no WebSocket of its own, install `ws` and pass it: `new Maitento({ webSocket: WebSocket })`. Otherwise, check
  that your network allows a WebSocket to the API.
- **TypeScript: the script never exits**: you opened the event stream yourself (`mt.events.connect()`) and
  `await mt.close()` is missing. An open connection keeps Node running.
- **A word or two is missing from the streamed text**: the connection dropped for a moment. Streamed text is best
  effort; `run.output` is complete.
- **`No namespace`**, **`Project folder not found: ../maitento`**, **`[api:model-keys:none-for-provider]`**: see
  [tutorial 1](01-hello-agent.md#if-it-didnt-work).

## Review

You built:

- a story that appears as the model writes it, in a terminal;
- a script that keeps the finished run, which holds the whole story, whatever happened to the stream.

The concept:

- [Live events](../concepts/runs-and-events.md#2-watch-it-live): one WebSocket that tells you about your runs as they
  change. `onToken` turns the `interaction-process-stream` event into text. It is for showing progress; the run is
  the record.

**Challenge:** print the run's status each time it changes, so you see it move from `New` to `Running` to
`Finished` around the story. The run helper takes another callback, `onUpdate` (`on_update` in Python, `OnUpdate` in
C#), that gets each new state of the run. It can be called more than once with the same status, so print only the
changes. The solution is in [`examples/05-streaming/solution`](../../examples/05-streaming/solution/).

**Next:** [6. Routed agents](06-routed-agents.md) hands each question to the right specialist.
