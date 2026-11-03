---
title: Interactions
description: An interaction is the job you run. It puts one or more agents to work on a task.
sidebar:
  order: 4
---

# Interactions

An **interaction** is the thing you actually run. It names the agents taking part, the task they work on, the
inputs the task needs, and optionally the tools available, the shape of the answer and the limits on time.

Starting an interaction creates a **run** with an id. When the run finishes, the answer is in its `output`.

See it in [tutorial 1, Hello, agent](../tutorials/01-hello-agent.md), which runs the smallest interaction there is,
and [tutorial 2, Prompts and inputs](../tutorials/02-prompts-and-inputs.md), which passes values into the task.

## Three kinds

| Kind | Folder | Who takes part | Use it for |
|---|---|---|---|
| **One-shot** | `interactions/one-shot/` | one agent | a question, a task, an extraction: one answer |
| **Round-robin** | `interactions/round-robin/` | agents (and optionally a person) taking turns | chats, debates, reviews |
| **Managed** | `interactions/managed/` | a manager agent and the team it hands work to | work that splits into parts |

Most things start as a one-shot. Round-robin and managed interactions are covered in [Teams of agents](teams.md) and,
for chatting with a person, in [tutorial 7](../tutorials/07-chat.md).

## A one-shot interaction

<!-- snippet: examples/02-prompts-and-inputs/maitento/interactions/one-shot/haiku.mtr -->
```hcl title="interactions/one-shot/haiku.mtr"
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

`agent` is the seat: the name the agent goes by in this interaction, and which agent fills it.

## Inputs

Inputs are like function parameters. Declare them under `inputs.prompts` and use them in the task as `%%name%%`.

| Field | Meaning |
|---|---|
| `name` | how the task refers to it: `%%topic%%` |
| `description` | shown in the portal and to callers |
| `required` | a run without it is refused before it starts, with `api:interactions:input-required` |
| `type` | `String` (the default), `Integer`, `Decimal` or `Boolean` |

Names are case-sensitive. A run that passes an input the interaction doesn't declare is refused too
(`api:interactions:input-unknown`), and so is a value that isn't of the input's `type`
(`api:interactions:input-invalid`). Nothing is spent on a refused run.

The task can also include text only when an input has a value:

<!-- snippet: examples/02-prompts-and-inputs/maitento/prompts/haiku-task.md -->
```md title="prompts/haiku-task.md"
Write a haiku about %%topic%%.
{{#if mood}}
The mood of the haiku should be %%mood%%.
{{/if}}
```
<!-- /snippet -->

`{{#if mood}}` is true when `mood` has any value at all, so a Boolean input set to `false` still counts. Use
`{{#unless name}}` for the opposite.

### Inputs for tools

Two more kinds of input feed [tools](tools.md) instead of the task. The model never sees either, so it can't change
them:

| Kind | Declared under | The run's value |
|---|---|---|
| A binding | `inputs.functions.binding` | goes straight into a tool's calls, as a body field or a query or path parameter: the knowledge base to search, say. See [values from the run](tools.md#values-from-the-run-not-the-model) |
| A secret | `inputs.functions.auth` | is the id of the [secret](secrets.md) a tool sends, such as one API key per shop. See [secrets chosen by the run](tools.md#secrets-chosen-by-the-run) |

A run passes all three kinds the same way, by name. Unlike a prompt input, a tool input can have a `default`, which a
run that leaves it out uses.

## Starting a run

<!-- tabs -->
```ts
const run = await mt.interactions.run("haiku", { inputs: { topic: "autumn rain", mood: "calm" } });
console.log(run.output);
```
```python
run = mt.interactions.run("haiku", inputs={"topic": "autumn rain", "mood": "calm"})
print(run.output)
```
```csharp
var inputs = new Dictionary<string, string> { ["topic"] = "autumn rain", ["mood"] = "calm" };
var run = await mt.Interactions.RunAsync("haiku", inputs);
Console.WriteLine(run.Output);
```
```bash
mt interaction-run haiku --input-topic "autumn rain" --input-mood calm
```
```bash title="curl"
curl -X PUT https://api.maitento.com/namespaces/hello-maitento/interactions/by-name/haiku/start \
  -H "Authorization: $MAITENTO_AUTH" -H "Content-Type: application/json" \
  -d '{"inputs": [{"name": "topic", "value": "autumn rain"}, {"name": "mood", "value": "calm"}]}'
```
<!-- /tabs -->

The SDKs' `run()` starts the run and waits for it. With curl you get the new run straight back, with status `New`,
and fetch it again until it finishes: see [Runs and events](runs-and-events.md).

## Statuses

| Status | Meaning |
|---|---|
| `New` | accepted, waiting for a worker (or for a free lane: see [Limits](limits.md#how-many-run-at-once)) |
| `Running` | working |
| `HumanInteractionRequired` | waiting for a person to say something. After three days with no message the run is closed as `Finished`; a message sent later opens it again ([Limits](limits.md#time)) |
| `HumanInteractionComplete` | a person has replied, and the run is waiting for a worker to carry on |
| `PendingApproval` | waiting for a person to approve a [tool call](tools.md#approvals) |
| `AwaitingChildren` | waiting for [sub-interactions](teams.md#sub-interactions) it started |
| `Finished` | done: the answer is in `output` |
| `Error` | failed, or ran out of time: the reason is in `failureDetails` |
| `Killed` | stopped by someone, or because the run that started it was stopped |

See them in [tutorial 4, Runs](../tutorials/04-runs.md#6-the-statuses): start a run without waiting, read it back,
and watch its status change.

## Who a message is from

Every message a person adds to a chat is saved with an **author**, a name and an id, and the agents see the name with
the message (`Ana (Human User): …`). Who the author is depends on how the caller signs in:

| The caller signs in with | The message is recorded as |
|---|---|
| an API key, naming no author | the API key's own user |
| an API key, naming an author | exactly that name and id |
| a person's own sign-in (the portal, or `mt api-login user`) | always that person; a named author is ignored |

So an app that talks to Maitento for its users, with one API key, can say which of its users wrote each message. The
id is the app's own, any GUID; an author named without an id is recorded with an id of all zeros. See it in
[tutorial 7, A chat](../tutorials/07-chat.md#5-who-said-it).

## Other properties

| Property | What it does |
|---|---|
| `functions.openApi` | [tools](tools.md) available to every agent in the interaction |
| `schema.solution` | the JSON Schema the answer must match: see [Structured output](structured-output.md) |
| `duration.warn`, `duration.max` | a time warning for the agents and a hard stop, as `"hh:mm:ss"`. See [Limits](limits.md) |
| `context` | how the conversation is trimmed when it no longer fits the model. See [Limits](limits.md) |
| `loom` | long-term [memory](memory.md) |
| `swarm` | other interactions this one may start as [sub-runs](teams.md#sub-interactions) |
| `prompts.system` | extra system instructions for every agent in the interaction |
