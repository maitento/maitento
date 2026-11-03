---
title: 19. Managed teams
description: A newsletter team where an editor plans the work, hands it out, and decides when it's done.
sidebar:
  order: 19
---

# 19. Managed teams

Build a newsletter team: an editor, a writer and a fact checker. The editor is the **manager**. It gets the task,
decides who does what and in which order, reads what comes back, and says when the newsletter is good enough. You'll
read the log of every piece of work it handed out, and see what happens when it runs out of the work it may hand
out. Use a managed team when a job needs several kinds of work and someone to judge the result.

> **You'll learn**
>
> - managed interactions: a manager that hands work to named team members
> - what each member sees: a fresh start every time, or its own ongoing conversation
> - reading what the manager did from the run
> - the limits on a team, and what the manager does when it reaches one
> - choosing between a router, sub-interactions and a managed team
>
> **New concepts:** [managed teams](../concepts/teams.md#managed-teams) ·
> **Builds on:** [18. Sub-interactions](18-sub-interactions.md) ·
> **Time:** about 15 minutes ·
> **Cost:** under $0.01 per newsletter on DeepSeek ·
> **Needs:** nothing beyond the [tutorials' setup](index.md#before-you-start)

## 1. The project

The editor is an ordinary agent. Its prompt says how to run the team, and that its final reply is the newsletter:

<!-- snippet: examples/19-managed-teams/maitento/agents/editor.mtr -->
```hcl title="maitento/agents/editor.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a newsletter editor. You plan the issue, hand work to your team with the Dispatch tool, and decide when it is good enough. Your final reply must be the finished newsletter and nothing else: no notes about the edits."
summary = "Plans and edits the newsletter"
```
<!-- /snippet -->

The writer and the fact checker are ordinary agents too. The **managed** interaction puts them together: the
`manager` owns the task, and the `agents` are the team it can hand work to:

<!-- snippet: examples/19-managed-teams/maitento/interactions/managed/newsletter.mtr -->
```hcl title="maitento/interactions/managed/newsletter.mtr"
// A managed interaction: the manager gets the task and hands out work.
// Team members only see what the manager sends them.
task = "Produce a three-paragraph newsletter about %%topic%% for a general audience."
inputs.prompts = [
  {
    name = "topic"
    required = true
  }
]
manager = {
  name = "Editor"
  agent = @ref("editor")
}
agents = [
  {
    name = "Writer"
    agent = @ref("writer")
    // Private: the writer keeps its own ongoing conversation with the editor.
    mode = "Private"
  },
  {
    name = "FactChecker"
    agent = @ref("fact-checker")
    // OneTime: a fresh fact checker every time it is asked.
    mode = "OneTime"
  }
]
limits.maxDispatches = 8
duration.max = "00:06:00"
```
<!-- /snippet -->

The manager gets a `Dispatch` tool. Each call names a team member and gives it a message. The member takes one turn
on that message, and its reply is the result of the call. A member's `mode` decides what it sees:

| `mode` | The member sees… | Use it for |
|---|---|---|
| `OneTime` (the default) | the manager's message, and nothing else, every time | independent checks: a fresh pair of eyes |
| `Private` | its own ongoing conversation with the manager: every message it was sent and every reply | work that's revised: it remembers its draft |
| `Group` | the shared conversation, like a round-robin where it speaks only when the manager hands it the turn | members who need to hear each other |

**Done when:** you can say which member remembers earlier work (the writer) and which starts fresh (the fact checker).

## 2. Run the team

Run the scripts from `examples/19-managed-teams/typescript`, `python` or `csharp`, as in
[tutorial 1](01-hello-agent.md#run-it). After the run, the script prints each piece of work the editor handed out,
with the first line of the reply, then the newsletter:

<!-- tabs -->
<!-- snippet: examples/19-managed-teams/typescript/newsletter.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// An editor hands work to a writer and a fact checker, then signs off the newsletter.
const run = await mt.interactions.run("newsletter", { inputs: { topic: "why sleep matters" } });

// Each piece of work the editor handed out is a Dispatch call on the run. Its result is the member's reply.
const firstLine = (text: string | null | undefined) => (text ?? "").split("\n").find((line) => line.trim()) ?? "";
for (const call of run.context.toolCall.filter((c) => c.functionName === "Dispatch")) {
  const { agent, message } = JSON.parse(call.argumentsJson) as { agent: string; message: string };
  console.log(`Editor -> ${agent}: ${firstLine(message).slice(0, 90)}`);
  const result = run.context.toolResult.find((r) => r.toolCallId === call.toolCallId);
  if (result) {
    const reply = await mt.interactionRuns.toolResult(run.id, result.sequence);
    console.log(`  ${firstLine(reply.result).slice(0, 100)}`);
  }
}
console.log(`\n${run.output}`);
```
<!-- /snippet -->
<!-- snippet: examples/19-managed-teams/python/newsletter.py -->
```python title="Python"
import json

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# An editor hands work to a writer and a fact checker, then signs off the newsletter.
run = mt.interactions.run("newsletter", inputs={"topic": "why sleep matters"})


# Each piece of work the editor handed out is a Dispatch call on the run. Its result is the member's reply.
def first_line(text: str | None) -> str:
    return next((line for line in (text or "").splitlines() if line.strip()), "")


for call in run.context.tool_call:
    if call.function_name != "Dispatch":
        continue
    arguments = json.loads(call.arguments_json)
    print(f"Editor -> {arguments['agent']}: {first_line(arguments['message'])[:90]}")
    result = next((r for r in run.context.tool_result if r.tool_call_id == call.tool_call_id), None)
    if result:
        reply = mt.interaction_runs.tool_result(run.id, result.sequence)
        print(f"  {first_line(reply.result)[:100]}")
print(f"\n{run.output}")
```
<!-- /snippet -->
<!-- snippet: examples/19-managed-teams/csharp/newsletter.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using System.Text.Json;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// An editor hands work to a writer and a fact checker, then signs off the newsletter.
var run = await mt.Interactions.RunAsync("newsletter", new Dictionary<string, string>
{
    ["topic"] = "why sleep matters",
});

// Each piece of work the editor handed out is a Dispatch call on the run. Its result is the member's reply.
foreach (var call in run.Context.ToolCall.Where(c => c.FunctionName == "Dispatch"))
{
    var arguments = JsonDocument.Parse(call.ArgumentsJson).RootElement;
    var agent = arguments.GetProperty("agent").GetString();
    Console.WriteLine($"Editor -> {agent}: {Cut(FirstLine(arguments.GetProperty("message").GetString()), 90)}");
    var result = run.Context.ToolResult.FirstOrDefault(r => r.ToolCallId == call.ToolCallId);
    if (result != null)
    {
        var reply = await mt.InteractionProcesses.GetToolResultAsync(run.Id, result.Sequence);
        Console.WriteLine($"  {Cut(FirstLine(reply?.Result), 100)}");
    }
}
Console.WriteLine($"\n{run.Output}");

static string FirstLine(string? text) =>
    (text ?? "").Split('\n').FirstOrDefault(line => line.Trim().Length > 0)?.TrimEnd() ?? "";

static string Cut(string text, int length) => text.Length <= length ? text : text[..length];
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt interaction-run newsletter --input-topic "why sleep matters"
```
<!-- /tabs -->

```text
Editor -> Writer: Write a three-paragraph newsletter section on why sleep matters, for a general audience. R
  **Why Sleep Matters More Than You Think**
Editor -> FactChecker: Please fact-check the following short newsletter section on sleep for accuracy. Verify eve
  **Fact-check: "Why Sleep Matters More Than You Think"**
Editor -> Writer: Your sleep newsletter draft is approved with the following fact-check changes. Please retu
  **Why Sleep Matters More Than You Think**

**Why Sleep Matters More Than You Think**

Sleep is far from idle time. While you rest, your body repairs tissue, strengthens the immune system and regulates
hormones that control appetite and stress. …

When sleep falls short, the effects show up quickly. …

The good news is that small, practical changes can make a real difference. …
```

A run takes about 30 seconds. What happened:

1. The editor got the task and the `Dispatch` tool. Nobody told it the order: it chose a draft first, then a check.
2. It sent the draft to the fact checker inside its message. The fact checker is `OneTime`, so the message is all it
   saw.
3. It sent the fact checker's corrections back to the writer. The writer is `Private`, so it still had its own draft
   and only had to change it.
4. When it was happy, it replied with the newsletter, and that reply became the run's `output`.

Every dispatch is kept on the run: a `Dispatch` tool call in `context.toolCall`, with `agent` and `message` in its
arguments, and the member's reply as its result. The result's text is fetched by its sequence number, with
`interactionRuns.toolResult`. The portal's **Runs** page shows the same: open the run to read each dispatch and reply.

**Done when:** you see at least two dispatches, one to the writer and one to the fact checker, then the newsletter.

## 3. Break it on purpose: run out of dispatches

A team needs limits, or a manager could hand out work for ever. Allow the editor just one dispatch. In
`newsletter.mtr`, change `limits.maxDispatches = 8` to `limits.maxDispatches = 1`, and run the script again:

```text
Editor -> Writer: Write a three-paragraph newsletter item for a general audience on why sleep matters. Requi
  **The Quiet Work of Sleep**
Editor -> FactChecker: Please fact-check the following short newsletter item for accuracy. Verify: (1) the claim
  You have made all 1 dispatches this interaction allows. Finish with what you have.

**The Quiet Work of Sleep**

Sleep is sometimes treated as optional, but it quietly underpins nearly everything we do. …
```

The editor still asked for a fact check, but the call was refused. The refusal came back as the call's result, so the
editor finished with what it had: a newsletter nobody checked. The run still ends `Finished`, and nothing in it is an
error. A limit like this is soft: the manager is told, and decides what to do.

A team has three limits:

| Limit | Default | When it's reached |
|---|---|---|
| `limits.maxDispatches` | 30 (at most 200) | the next `Dispatch` is refused, and the manager is told to finish |
| `context.maxToolCallLoops` | 10 | the manager's tools are taken away for the rest of its turn, and it must answer |
| `duration.max` | none | the run stops with status `Error` and `Interaction timed out`, with no newsletter |

`duration.warn` tells the agents when time is getting short, before `duration.max` stops them.

Change `maxDispatches` back to 8 before you go on.

**Done when:** the second dispatch was refused, and the newsletter still came back.

## 4. Which team shape?

You've now seen three ways for agents to share work. They answer different questions:

| | [Router](06-routed-agents.md) | [Sub-interactions](18-sub-interactions.md) | Managed team |
|---|---|---|---|
| **Who decides** | a router picks one specialist per turn | an agent starts runs as it sees fit | a manager hands out each piece |
| **Runs at once** | one specialist | many, in parallel | one dispatch at a time |
| **What helpers see** | the whole conversation | their own inputs, in their own run | the manager's message, or their own conversation |
| **Good for** | questions that each belong to one expert | many independent pieces of the same kind | work that's drafted, checked and revised |
| **In the run** | `routingDecisions` | child runs, each naming its parent | `Dispatch` calls in the run's context |

A managed team works in one run, one dispatch at a time. When the pieces can run at the same time, give the
manager sub-interactions as well: a managed interaction can have a `swarm` block too.

For a conversation where agents and a person talk things over, use a [round-robin](07-chat.md) instead.

**Done when:** you can say which shape fits a support desk that sends billing questions to one agent and technical
ones to another. (A router.)

## All the files

Every file in this tutorial's project:

<!-- project: examples/19-managed-teams -->
**On GitHub:** [`examples/19-managed-teams`](https://github.com/maitento/maitento/tree/main/examples/19-managed-teams) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/19-managed-teams/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/19-managed-teams/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/19-managed-teams/csharp)

<details>
<summary>All the files in this project (4)</summary>

<!-- tabs: files -->
**`maitento/agents/editor.mtr`**
```hcl title="maitento/agents/editor.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a newsletter editor. You plan the issue, hand work to your team with the Dispatch tool, and decide when it is good enough. Your final reply must be the finished newsletter and nothing else: no notes about the edits."
summary = "Plans and edits the newsletter"
```

**`maitento/agents/fact-checker.mtr`**
```hcl title="maitento/agents/fact-checker.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You check text for claims that are wrong or unsupported, and list each problem with a fix."
summary = "Checks facts"
```

**`maitento/agents/writer.mtr`**
```hcl title="maitento/agents/writer.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You write clear, lively newsletter sections exactly as the editor asks."
summary = "Writes newsletter sections"
```

**`maitento/interactions/managed/newsletter.mtr`**
```hcl title="maitento/interactions/managed/newsletter.mtr"
// A managed interaction: the manager gets the task and hands out work.
// Team members only see what the manager sends them.
task = "Produce a three-paragraph newsletter about %%topic%% for a general audience."
inputs.prompts = [
  {
    name = "topic"
    required = true
  }
]
manager = {
  name = "Editor"
  agent = @ref("editor")
}
agents = [
  {
    name = "Writer"
    agent = @ref("writer")
    // Private: the writer keeps its own ongoing conversation with the editor.
    mode = "Private"
  },
  {
    name = "FactChecker"
    agent = @ref("fact-checker")
    // OneTime: a fresh fact checker every time it is asked.
    mode = "OneTime"
  }
]
limits.maxDispatches = 8
duration.max = "00:06:00"
```
<!-- /tabs -->

</details>

<!-- /project -->

## If it didn't work

- **The output is the editor's notes about the newsletter, not the newsletter:** the manager's final reply is the
  run's `output`. Say in its prompt that its final reply must be the finished piece and nothing else, as `editor.mtr`
  does.
- **The editor writes the newsletter itself, with no dispatches:** a manager can do the work alone if its prompt lets
  it. Tell it to hand work out with the `Dispatch` tool.
- **"There is no agent called …":** the manager used a name that isn't in `agents`. The names it may use are the
  `name`s in the interaction, not the agent files' names.
- **The run ends `Error` with `Interaction timed out`:** the team needed longer than `duration.max`. Raise it.
- **The run ends `Error`, and its failure details end with `[api:model-keys:none-for-provider]`:** the tenant has
  no DeepSeek key. Add one ([Model keys](../concepts/models-and-keys.md)), or change `model` in the three agent files.

## Review

**What you built:** a newsletter team where an editor hands work to a writer and a fact checker, and decides when
it's done; a log of every piece of work it handed out; and a run where the team hit its limit.

**The concepts:**

- [Managed teams](../concepts/teams.md#managed-teams): a manager owns the task and hands work to named members with
  `Dispatch`. Its final reply is the answer.
- **Member modes:** `OneTime` starts fresh, `Private` keeps its own conversation with the manager, `Group` sees the
  shared one.
- **Limits:** `maxDispatches` is soft (the manager is told), `duration.max` is hard (the run stops).
- **Choosing a shape:** a router picks one expert, sub-interactions fan out in parallel, a manager plans and judges.

**Challenge:** give the team a headline writer. It should start fresh each time, and the editor should put a
headline on top of the newsletter. Print which members the editor asked, in order. A solution in TypeScript, Python
and C# is in [`examples/19-managed-teams/solution`](../../examples/19-managed-teams/solution/):

```text
The editor handed out work 3 times: Writer, FactChecker, HeadlineWriter

Sleep: The Maintenance Your Body Needs

Sleep is easy to treat as optional — the thing we cut when the day runs short — but the body treats it as
essential. …
```

**Next:** [20. Memory](20-memory.md) gives an agent a memory that lasts from one run to the next.
