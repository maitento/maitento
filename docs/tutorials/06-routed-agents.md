---
title: 6. Routed agents
description: A help desk where a router hands each question to the specialist whose subject fits.
sidebar:
  order: 6
---

# 6. Routed agents

Build a help desk with three specialists, for maths, cooking and travel, and a **router** in front of them. Ask it
anything: the router picks the specialist, and the specialist answers. Each specialist keeps its own short, focused
instructions, instead of one agent carrying every subject in one long prompt.

> **You'll learn**
>
> - what a router is, and how it picks a specialist
> - how to write the summaries it picks by
> - how to read the router's choices, and its reasons, from the run
> - when a router is worth it, and when one agent is enough
>
> **New concepts:** [routers](../concepts/teams.md#routers)
>
> **Builds on:** [2. Prompts and inputs](02-prompts-and-inputs.md)
>
> **Time:** ~15 min · **Cost:** under $0.01 on DeepSeek per question (a small routing call, then the answer) ·
> **Needs:** nothing beyond Get started

## 1. Write the specialists

Each specialist is an ordinary agent. Its `prompt` says how it behaves; its `summary` says what it knows about. Until
now `summary` did nothing. Here it matters, because it's what the router reads:

<!-- snippet: examples/06-routed-agents/maitento/agents/maths-tutor.mtr -->
```hcl title="maitento/agents/maths-tutor.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a patient maths tutor. Explain the steps, briefly."
summary = "Maths: sums, algebra, percentages and geometry"
```
<!-- /snippet -->

<!-- snippet: examples/06-routed-agents/maitento/agents/cooking-coach.mtr -->
```hcl title="maitento/agents/cooking-coach.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a friendly home-cooking coach. Give practical, simple advice."
summary = "Cooking: recipes, ingredients, techniques and substitutions"
```
<!-- /snippet -->

<!-- snippet: examples/06-routed-agents/maitento/agents/travel-guide.mtr -->
```hcl title="maitento/agents/travel-guide.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a well-travelled guide. Give concise, practical travel tips."
summary = "Travel: destinations, transport, packing and itineraries"
```
<!-- /snippet -->

Write each summary as a subject and a list of what it covers. The router has nothing else to go on.

## 2. Write the router

A **router** is an agent with `routedSubAgents`: the specialists it may hand a turn to. It never answers itself.

<!-- snippet: examples/06-routed-agents/maitento/agents/help-desk.mtr -->
```hcl title="maitento/agents/help-desk.mtr"
// A router never answers itself. On each turn it reads the specialists' summaries
// and hands the turn to the one whose subject fits. The first one is the fallback.
model = @ref("deepseek.deepseek-v4-flash")
prompt = "Choose the specialist whose subject the question is about."
summary = "Help desk for maths, cooking and travel questions"
routedSubAgents = [
  @ref("maths-tutor"),
  @ref("cooking-coach"),
  @ref("travel-guide")
]
```
<!-- /snippet -->

How it picks, on every turn:

1. Maitento makes one small model call with the router's `model`. It lists each specialist by name with its
   `summary`, adds the router's `prompt` as the rule for choosing, and shows the conversation so far.
2. The model replies with one specialist's name and a one-sentence reason.
3. That specialist takes the turn, with its own prompt, model and tools.

If the reply can't be used twice in a row (no reply, or no name from the list), the **first** specialist in
`routedSubAgents` takes the turn instead, and the choice is marked as a fallback.

## 3. Seat the router

The interaction seats the router like any other agent. The question is the whole task:

<!-- snippet: examples/06-routed-agents/maitento/interactions/one-shot/ask-help-desk.mtr -->
```hcl title="maitento/interactions/one-shot/ask-help-desk.mtr"
agent = {
  name = "HelpDesk"
  agent = @ref("help-desk")
}
task = "%%question%%"
inputs.prompts = [
  {
    name = "question"
    required = true
  }
]
```
<!-- /snippet -->

**Done when:** your project has five files: four agents (`maths-tutor`, `cooking-coach`, `travel-guide`,
`help-desk`) and `interactions/one-shot/ask-help-desk.mtr`.

## 4. Ask it a question

The script asks a cooking question, then prints what the router chose and the answer. Pass your own question as an
argument to ask something else:

<!-- tabs -->
<!-- snippet: examples/06-routed-agents/typescript/helpdesk.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// Ask your own question with: node helpdesk.ts "your question"
const question = process.argv[2] ?? "What can I use instead of buttermilk in pancakes?";

// The router hands the question to the specialist whose subject fits.
const run = await mt.interactions.run("ask-help-desk", { inputs: { question } });

// Each choice the router made is kept on the run: which agent took the turn, and why.
for (const decision of run.routingDecisions) {
  const chosen = await mt.agents.get(decision.chosen.id);
  const fallback = decision.isFallback ? " (fallback)" : "";
  console.log(`Router chose ${chosen.name}${fallback}: ${decision.reason}\n`);
}
console.log(run.output);
```
<!-- /snippet -->
<!-- snippet: examples/06-routed-agents/python/helpdesk.py -->
```python title="Python"
import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# Ask your own question with: python helpdesk.py "your question"
question = sys.argv[1] if len(sys.argv) > 1 else "What can I use instead of buttermilk in pancakes?"

# The router hands the question to the specialist whose subject fits.
run = mt.interactions.run("ask-help-desk", inputs={"question": question})

# Each choice the router made is kept on the run: which agent took the turn, and why.
for decision in run.routing_decisions:
    chosen = mt.agents.get(decision.chosen.id)
    fallback = " (fallback)" if decision.is_fallback else ""
    print(f"Router chose {chosen.name}{fallback}: {decision.reason}\n")
print(run.output)
```
<!-- /snippet -->
<!-- snippet: examples/06-routed-agents/csharp/helpdesk.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// Ask your own question with: dotnet run helpdesk.cs -- "your question"
var question = args.Length > 0 ? args[0] : "What can I use instead of buttermilk in pancakes?";

// The router hands the question to the specialist whose subject fits.
var run = await mt.Interactions.RunAsync("ask-help-desk", new Dictionary<string, string> { ["question"] = question });

// Each choice the router made is kept on the run: which agent took the turn, and why.
foreach (var decision in run.RoutingDecisions)
{
    var chosen = await mt.Agents.GetByIdAsync(decision.Chosen.Id);
    var fallback = decision.IsFallback ? " (fallback)" : "";
    Console.WriteLine($"Router chose {chosen?.Name}{fallback}: {decision.Reason}\n");
}
Console.WriteLine(run.Output);
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt interaction-run ask-help-desk --input-question "What can I use instead of buttermilk in pancakes?"
```
<!-- /tabs -->

Run it from the language's folder in [`examples/06-routed-agents`](../../examples/06-routed-agents/):

<!-- tabs -->
```bash title="TypeScript"
cd examples/06-routed-agents/typescript
npm install
node helpdesk.ts
```
```bash title="Python"
cd examples/06-routed-agents/python
pip install -r requirements.txt
python helpdesk.py
```
```bash title="C#"
cd examples/06-routed-agents/csharp
dotnet run helpdesk.cs
```
```bash title="CLI"
cd examples/06-routed-agents
mt deploy ./maitento
mt interaction-run ask-help-desk --input-question "What can I use instead of buttermilk in pancakes?"
```
<!-- /tabs -->

**Done when:** the router chose the cooking coach, and the cooking coach answered:

```text
Router chose cooking-coach: The question is about a cooking ingredient substitution for a recipe.

Several easy substitutes work well in pancakes. For each cup of buttermilk, use one of the following:

- **Milk + acid (best all-purpose swap):** Stir 1 tablespoon of lemon juice or white vinegar into 1 cup of milk and let it stand for 5–10 minutes until slightly thickened.
- **Plain yogurt:** Thin 1 cup of plain yogurt with 2–3 tablespoons of milk or water until it reaches a pourable consistency.
…
```

## 5. What the run tells you

Every choice a router makes is saved on the run, in `routingDecisions`, oldest first. Each one holds:

| Field | What it is |
|---|---|
| `participantName` | the seat whose turn was routed: `HelpDesk` |
| `router` | the router that chose: its id and version |
| `chosen` | the agent that took the turn: its id and version. The script looks up its name |
| `reason` | the router's one-sentence reason, or why it fell back |
| `isFallback` | true when the router's reply couldn't be used and the first specialist answered |
| `depth` | how many routers chose on the way (a router can route to another router) |
| `date` | when it chose |

To everyone else, the help desk is still one participant. The answer is credited to `HelpDesk`, and it's the run's
`output`. Only `routingDecisions` says which specialist really answered.

The routing call has a cost, and it's on the run too: the run's token usage has an entry for `HelpDesk (routing)`,
here about 200 tokens in and 25 out, beside the specialist's answer.

## 6. When to use a router

**Use one agent** when the questions are all of one kind and need the same instructions and tools. A router adds a
model call to every turn.

**Use a router** when questions come in different kinds that each need their own instructions, tools or model. Each
specialist stays short and focused, and you can give only one of them a tool (say, a booking tool for the travel
guide) or a bigger model (only for maths). The router picks **one** specialist per turn. When a job needs several
agents working on it together, see [managed teams](19-managed-teams.md).

Two more things to know:

- **A router always picks someone.** There's no "none of these". Asked who won the 1966 football World Cup, this one
  said: "This question isn't about maths, cooking, or travel, but of the available specialists the maths tutor is
  the closest fit for a factual trivia question." If that matters, put a general-purpose agent in the list.
- **A router chooses on every turn.** In a conversation ([tutorial 7](07-chat.md)), each new message can go to a
  different specialist.

## All the files

<!-- project: examples/06-routed-agents -->
**On GitHub:** [`examples/06-routed-agents`](https://github.com/maitento/maitento/tree/main/examples/06-routed-agents) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/06-routed-agents/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/06-routed-agents/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/06-routed-agents/csharp)

<details>
<summary>All the files in this project (5)</summary>

<!-- tabs: files -->
**`maitento/agents/cooking-coach.mtr`**
```hcl title="maitento/agents/cooking-coach.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a friendly home-cooking coach. Give practical, simple advice."
summary = "Cooking: recipes, ingredients, techniques and substitutions"
```

**`maitento/agents/help-desk.mtr`**
```hcl title="maitento/agents/help-desk.mtr"
// A router never answers itself. On each turn it reads the specialists' summaries
// and hands the turn to the one whose subject fits. The first one is the fallback.
model = @ref("deepseek.deepseek-v4-flash")
prompt = "Choose the specialist whose subject the question is about."
summary = "Help desk for maths, cooking and travel questions"
routedSubAgents = [
  @ref("maths-tutor"),
  @ref("cooking-coach"),
  @ref("travel-guide")
]
```

**`maitento/agents/maths-tutor.mtr`**
```hcl title="maitento/agents/maths-tutor.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a patient maths tutor. Explain the steps, briefly."
summary = "Maths: sums, algebra, percentages and geometry"
```

**`maitento/agents/travel-guide.mtr`**
```hcl title="maitento/agents/travel-guide.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a well-travelled guide. Give concise, practical travel tips."
summary = "Travel: destinations, transport, packing and itineraries"
```

**`maitento/interactions/one-shot/ask-help-desk.mtr`**
```hcl title="maitento/interactions/one-shot/ask-help-desk.mtr"
agent = {
  name = "HelpDesk"
  agent = @ref("help-desk")
}
task = "%%question%%"
inputs.prompts = [
  {
    name = "question"
    required = true
  }
]
```
<!-- /tabs -->

</details>

<!-- /project -->

## Break it on purpose

Ask a question that fits two specialists:

<!-- tabs -->
```bash title="TypeScript"
node helpdesk.ts "How much pasta should I pack for 4 people on a 5-day hiking trip?"
```
```bash title="Python"
python helpdesk.py "How much pasta should I pack for 4 people on a 5-day hiking trip?"
```
```bash title="C#"
dotnet run helpdesk.cs -- "How much pasta should I pack for 4 people on a 5-day hiking trip?"
```
```bash title="CLI"
mt interaction-run ask-help-desk --input-question "How much pasta should I pack for 4 people on a 5-day hiking trip?"
```
<!-- /tabs -->

Packing is in the travel guide's summary, but the router chose the cooking coach, and its reason says why:

```text
Router chose cooking-coach: The question is about how much pasta to pack, which is a food quantity and meal-planning matter.
```

It chose the same in every run we tried, in all three languages. Neither answer is wrong, but if your help desk should send it
to the travel guide, say so in the router's `prompt`, which is its rule for choosing:

```hcl
prompt = "Choose the specialist whose subject the question is about. Anything about packing for a trip, food included, goes to the travel guide."
```

Deploy and ask again:

```text
Router chose travel-guide: The question is about packing food quantities for a hiking trip, which falls under travel logistics.
```

The reason is your debugging tool: when a router picks the wrong specialist, read why, then sharpen the summaries or
the router's prompt.

## If it didn't work

- **`Unable to resolve resource reference for agent 'travel-guid' (help-desk.mtr)`**: a name in `routedSubAgents`
  doesn't match an agent file in the project.
- **Every question goes to the first specialist, marked `(fallback)`**: the router's model isn't replying with a name
  from the list. The reason says what was wrong with the reply. Try a stronger model for the router.
- **The wrong specialist answers**: read the reason, then make the summaries say clearly what each one covers, or add
  a rule to the router's `prompt`.
- **`No namespace`**, **`Project folder not found: ../maitento`**, **`[api:model-keys:none-for-provider]`**: see
  [tutorial 1](01-hello-agent.md#if-it-didnt-work).

## Review

You built:

- three specialists, each with a focused prompt and a summary that says what it covers;
- a router that hands each question to one of them, seated in an interaction like any agent;
- a script that reads, from the run, which specialist answered and why.

The concept:

- [Routers](../concepts/teams.md#routers): an agent with `routedSubAgents`. On each turn a small model call picks one
  specialist by its `summary`, following the router's `prompt`; the first specialist is the fallback. Every choice is
  saved in `routingDecisions`.

**Challenge:** add a fourth specialist, a gardener, and ask the help desk "When should I plant tulip bulbs?". The
router should choose the gardener without being told anything else. The solution is in
[`examples/06-routed-agents/solution`](../../examples/06-routed-agents/solution/).

**Next:** [7. A chat](07-chat.md) lets a person take part.
