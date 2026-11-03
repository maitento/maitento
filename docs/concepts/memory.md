---
title: Memory
description: Looms give agents long-term memory, so they remember people and decisions across conversations.
sidebar:
  order: 13
---

# Memory

A **loom** is an agent's long-term memory. Without one, every run starts from nothing. With one, an agent remembers
what it learned: who it's talking to, what they care about, what was decided.

See it in [tutorial 20, Memory](../tutorials/20-memory.md): Wren, a companion that remembers what each person told it
in passing, and knows nothing about someone it hasn't met.

## How it works

- Each memory is a **thread**: a fact, an event, a relationship, a how-to, or an intention to act on later.
- Threads are **woven** into the loom from the conversation. Who does it depends on the interaction's `weave`
  setting:
  - `Suggest` (the default): a **weaver** reads each exchange in the background and offers the agent what may be worth
    keeping. The agent decides.
  - `Auto`: the weaver weaves what's worth keeping itself, with no help from the agent. New threads start weak; using
    them makes them stronger. Tutorial 20 works this way.
  - `Manual`: only the agent weaves.

  In every mode the agent also has memory tools, such as `LoomWeave` to keep something itself and `LoomRecall` to
  search what it holds.
- When a conversation starts, the agent gets a short **tapestry**: "what you know", written into its instructions.
- After a quiet period, **night weaving** tidies up the day. It writes a summary of each conversation, merges
  duplicates, notes contradictions, and writes a short portrait of each person.
- Threads that are never used slowly fade, and threads that are used get stronger.

## Turn it on

Memory is switched on in the interaction, under `loom`:

<!-- snippet: examples/20-memory/maitento/interactions/round-robin/wren-chat.mtr -->
```hcl title="interactions/round-robin/wren-chat.mtr"
// A one-to-one conversation with Wren, a companion who remembers.
//
// Each person gets their own loom (scope = "Input" on userName), so Wren wakes up knowing whoever
// it is talking to, and never mixes one person's threads into another's conversation.

agents = [
  {
    name = "Wren"
    agent = @ref("wren")
  }
]

task = @prompt("wren-chat")

inputs.prompts = [
  {
    name = "userName"
    required = true
  }
]

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

loom = {
  enabled = true
  // One loom per value of the userName input: one memory per person.
  scope = "Input"
  scopeInput = "userName"
  // Memories are about the person named by userName.
  subjectInputs = [ "userName" ]
  // A weaver reads every exchange and keeps what is worth keeping. Wren can also weave and recall itself.
  weave = "Auto"
  recall = "Suggest"
  // Five quiet minutes after a conversation, night weaving tidies the memory up.
  nightWeaving = true
  quietMinutes = 5
}
```
<!-- /snippet -->

The most important setting is **`scope`**, which decides whose memory a run uses:

| `scope` | One loom per… | Remembers across runs? |
|---|---|---|
| `Process` (the default) | run | **no**, only within one run |
| `Interaction` | seat in this interaction (one for every seat, with `shared = true`) | yes, shared by everyone who runs it |
| `Input` | value of the input named by `scopeInput` | yes, per person, project or whatever the input is |

`scope = "Input"` with `scopeInput = "userName"` gives each person their own memory, so Wren never mixes one
person's threads into another's conversation. The memory is chosen from the input before the agent says a word, so
no question can reach someone else's. Values are compared exactly: `Ana` and `ana` are two people.

**Loom names.** A loom an interaction makes for itself is named after it, so you can find it with `looms.list`:

| `scope` | Name | In tutorial 20 |
|---|---|---|
| `Input` | `<interaction>/<seat>/<input value>` | `wren-chat/Wren/Ana` |
| `Interaction` | `<interaction>/<seat>` | `wren-chat/Wren` |
| `Process` | `<interaction>/<seat>/run-<8 characters of its id>` | |

With `shared = true` the seat part is `shared`. The names of the looms you declare yourself, in `looms/`, never have a
`/` in them, so the two kinds can't be mistaken for each other.

Other settings:

| Setting | Values |
|---|---|
| `recall` | `Off` (the agent searches only when it chooses to), `Suggest` (the default: the agent is told what may connect, and chooses whether to recall it) or `Surface` (relevant threads are shown in the conversation straight away) |
| `weave` | `Suggest` (the default), `Auto` or `Manual`: see [How it works](#how-it-works) |
| `subjectInputs` | the inputs that name who the conversation is about, so threads are filed under that person |
| `tapestryTokens` | how long the "what you know" summary may be (default 1500) |
| `nightWeaving`, `quietMinutes` | consolidate after a conversation has been quiet this many minutes (on, after 15 minutes, by default) |

## A memory several interactions share

Declare a named loom in `looms/`, and bind an agent's seat to it with `loom = @ref("family")`. Every conversation
that uses that seat reads and weaves the same memory, whoever is talking. Tutorial 20's `wren-family` interaction
does this for a whole household.

<!-- snippet: examples/20-memory/maitento/looms/family.mtr -->
```hcl title="looms/family.mtr"
// A loom a whole household shares. Declared here, it exists before anyone talks to Wren: deploying
// creates it (or updates its settings); a deploy never touches what it holds.

description = "What Wren knows about the family: shared across everyone who talks to it in wren-family."
nightWeaving = true
quietMinutes = 5
```
<!-- /snippet -->

## Looking inside

You can read a loom's threads, its current tapestry and its night-weaving log with the API, the SDKs, the portal's
**Looms** page, or `mt loom-threads`, `mt loom-tapestry` and `mt loom-weavings`.
[Tutorial 20](../tutorials/20-memory.md#3-look-inside-the-memory) finds a person's loom by its name and prints its
threads and tapestry.

## Good to know

- **Search by meaning needs an OpenAI model key.** Threads are found by meaning with embeddings. Without an OpenAI
  [model key](models-and-keys.md), recall falls back to matching words, and memory otherwise works the same.
- **Weaving and night weaving use the agent's model** (or the interaction's `weaverModel`, when it names one), on
  your model keys. A night weave costs about as much as one more reply.
- **Night-weaving settings stick.** A loom an interaction made keeps the `nightWeaving`, `quietMinutes` and
  `weaverModel` it was created with, so changing them in the interaction only reaches people Wren hasn't met yet.
  Change an existing loom with `looms.update` or `mt loom-update`. The other settings, such as `recall` and `weave`,
  come from the interaction on every run.
