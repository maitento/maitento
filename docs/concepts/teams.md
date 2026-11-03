---
title: Teams of agents
description: Routers, round-robin conversations, managed teams and sub-interactions, and when to use each.
sidebar:
  order: 12
---

# Teams of agents

One agent is often enough. When it isn't, Maitento has four ways for agents to work together:

| Pattern | What happens | Good for |
|---|---|---|
| [Router](#routers) | a router agent picks one specialist to answer each turn | help desks, triage |
| [Round-robin](#round-robin) | agents (and a person) take turns in one conversation | chats, reviews, debates |
| [Managed](#managed-teams) | a manager hands pieces of work to a team | work that splits into parts |
| [Sub-interactions](#sub-interactions) | an agent starts other interactions and waits for them | doing many things in parallel |

## Routers

A **router** is an agent that never answers itself. On each turn it reads the specialists' `summary` lines and hands
the turn to the one whose subject fits. The first specialist is the fallback.

<!-- snippet: examples/06-routed-agents/maitento/agents/help-desk.mtr -->
```hcl title="agents/help-desk.mtr"
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

Put a router in an interaction like any other agent. Each choice it makes is recorded on the run in
`routingDecisions`. Write the specialists' `summary` lines for the router: they are what it chooses by.

**How it chooses.** On each turn the router makes one small model call, with no tools. It is given each specialist's
`summary`, its own `prompt` as the rule for choosing, and the latest part of the conversation (about the last
12,000 characters), and it answers with the specialist it picked and a one-sentence reason. If that reply can't be
used, for example because it names no one on the list, the router is asked once more. After a second unusable reply
the **first** specialist takes the turn, and the decision is marked `isFallback`.

- **A router always picks someone.** There is no "none of these". If a question may fit no specialist, put a
  general-purpose agent in the list.
- **It chooses on every turn**, so in a conversation each message can go to a different specialist.
- **Choosing costs tokens.** The routing call's usage is on the run under `<participant> (routing)`, beside the
  specialist's.
- **A router can hand a turn to another router**, up to three in a row.

See it in [tutorial 6, Routed agents](../tutorials/06-routed-agents.md).

## Round-robin

In a **round-robin** interaction, agents sit at a table and take turns on one shared conversation. Each agent can:

- answer;
- pass;
- ask another agent a private question;
- propose a final answer, which the others vote on.

A person can sit at the table too, speaking first or last.

<!-- snippet: examples/07-chat/maitento/interactions/round-robin/chat.mtr -->
```hcl title="interactions/round-robin/chat.mtr"
// A round-robin interaction where a person sits at the table and speaks first.
agents = [
  {
    name = "Assistant"
    agent = @ref("assistant")
  }
]
task = "Chat with the person. Answer what they ask."
features = {
  voting = false
  noAction = false
  directQuestions = false
  solutionProposal = false
}
human = {
  first = true
  solutions = false
}
```
<!-- /snippet -->

| Setting | What it does |
|---|---|
| `features = { noAction voting directQuestions solutionProposal }` | which moves agents may make (all on by default) |
| `human = { first = true }` | a person takes part, and speaks first (`false`: last) |
| `human = { votes = true solutions = true }` | the person votes on proposals, or can accept one as the answer |
| `rules.noActionLoops.max` | how many rounds of everyone passing end the run |

**How it ends:**

- every agent agrees to a proposed answer, which becomes the `output`;
- the time limit runs out;
- everyone keeps passing.

With nobody able to propose an answer (`solutionProposal = false`), a chat with a person carries on until it is
stopped.

See it in [tutorial 7, A chat](../tutorials/07-chat.md), where a person and an assistant take turns.

## Managed teams

In a **managed** interaction, a manager agent owns the task and sends work to named team members with a `Dispatch`
tool. Team members see only what the manager sends them.

<!-- snippet: examples/19-managed-teams/maitento/interactions/managed/newsletter.mtr -->
```hcl title="interactions/managed/newsletter.mtr"
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

| Member `mode` | The member… |
|---|---|
| `OneTime` | starts fresh every time it's asked |
| `Private` | keeps its own ongoing conversation with the manager |
| `Group` | sees the shared conversation |

The manager's final reply is the `output`. With a [schema](structured-output.md), or a person in the team, the
manager finishes with a `Finish` tool instead. Every piece of work it hands out is kept on the run, as a `Dispatch`
tool call with the member's name (`agent`) and the `message` in its arguments, and the member's reply as its result.

A team needs limits, or a manager could hand out work for ever. They behave differently:

| Limit | Default | When it's reached |
|---|---|---|
| `limits.maxDispatches` | 30 (at most 200) | **soft:** the next `Dispatch` is refused, and the manager is told to finish with what it has. The run still ends `Finished` |
| `context.maxToolCallLoops` | 10 | the manager's tools are taken away for the rest of its turn, and it must answer |
| `duration.max` | none | **hard:** the run stops with `Error` (`Interaction timed out`), and there's no answer |

See it in [tutorial 19, Managed teams](../tutorials/19-managed-teams.md): an editor hands work to a writer and a fact
checker, and [runs out of dispatches](../tutorials/19-managed-teams.md#3-break-it-on-purpose-run-out-of-dispatches)
on purpose. Its last step compares the three team shapes.

## Sub-interactions

An agent can start **other interactions** as child runs, wait for them, and combine their answers. The parent waits
in `AwaitingChildren` without holding a worker.

It takes three switches:

1. the interaction lists the interactions its agents may start, under `swarm`;
2. the agent has `allowSwarm = true`;
3. the seat is allowed to (by default every seat is; `swarm.participants` narrows it).

<!-- snippet: examples/18-sub-interactions/maitento/interactions/one-shot/compare-countries.mtr -->
```hcl title="interactions/one-shot/compare-countries.mtr"
agent = {
  name = "LeadResearcher"
  agent = @ref("lead-researcher")
}
task = "Compare these countries: %%countries%%. Start one country-facts interaction per country so they run in parallel, wait for them all, then write a short comparison."
inputs.prompts = [
  {
    name = "countries"
    description = "A comma-separated list of countries"
    required = true
  }
]
// The interactions this one may start as sub-runs, and how many at once.
swarm = {
  interactions = [
    @ref("country-facts")
  ]
  maxConcurrent = 5
  maxTotal = 10
}
duration.max = "00:05:00"
```
<!-- /snippet -->

The agent gets `StartInteraction`, `AwaitInteractions` and `CancelInteraction` tools. Child runs use the same model
keys, and can't run past the time the parent has left. The limits default to 1 level deep, 5 at once and 20 in total.
`swarm` can raise them to 4, 20 and 100.

**The run tree.** Every child names its parent: `parentProcessId` is the run that started it, and `rootProcessId` the
top of the tree. So listing runs by `parentProcessId` finds what a run started, and by `rootProcessId` a whole tree,
however deep. The parent keeps its own list in `swarm.children`: each child's run id (`processId`), its interaction
and the seat that started it. The portal shows them on the parent run's **Sub-interactions** tab.

**When a child fails.** A child that ends `Error` or `Killed` is not an error in the parent. `AwaitInteractions` gives
the agent each child's status, then its answer if it finished or the reason it failed, and the parent carries on.
What it does next is up to its prompt: tell it to say what's missing, or it may quietly fill the gap from what it
already knows. The other way round, when a parent ends, however it ends, any run it started that is still going is
stopped.

See it in [tutorial 18, Sub-interactions](../tutorials/18-sub-interactions.md): a lead researcher starts one run per
country, the script [finds the runs it started](../tutorials/18-sub-interactions.md#3-find-the-runs-it-started), and
[one child is stopped](../tutorials/18-sub-interactions.md#4-break-it-on-purpose-a-child-that-fails) on purpose.
