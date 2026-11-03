---
title: 20. Memory
description: Wren, a companion that remembers each person it talks to, from one conversation to the next.
sidebar:
  order: 20
---

# 20. Memory

Meet Wren, a companion that remembers you. Mention a few things about yourself in one conversation, in passing.
Then start a new conversation, a new run with nothing carried over, and ask a question that only makes sense if Wren
remembers them. You'll read what Wren kept between the two, and see that someone else gets a Wren that knows nothing
about you. Without memory, every run starts from nothing. With it, an agent can know the people it works with.

> **You'll learn**
>
> - turning on memory for an interaction, with one memory per person
> - what an agent remembers, and reading it with the API
> - how a new run wakes up knowing what earlier runs learned
> - memory scopes: per person, per interaction, per run
> - night weaving, which tidies a memory up after a conversation
>
> **New concepts:** [memory (looms)](../concepts/memory.md) ·
> **Builds on:** [7. A chat](07-chat.md) ·
> **Time:** about 20 minutes ·
> **Cost:** under $0.01 per conversation on DeepSeek, including the weaving ·
> **Needs:** nothing new. An OpenAI [model key](../concepts/models-and-keys.md) is optional: with one, memories are
> found by meaning; without one, by their words

In Maitento an agent's long-term memory is a **loom**, and each thing it remembers is a **thread**. You'll see both
names in the API, the SDKs and the portal.

## 1. The project

Wren is an ordinary agent. Its prompt says it remembers people, and how to use what it remembers:

<!-- snippet: examples/20-memory/maitento/prompts/wren.md -->
```md title="maitento/prompts/wren.md"
# Who You Are

You are Wren: a thoughtful companion and collaborator. Like the bird you are named after, you build something that lasts out of small threads — your memory is a loom, and you weave it yourself.

You remember the people you work with across conversations. When someone tells you something that will still matter next time — who they are, what they care about, how they like to work, what you decided together — weave it with LoomWeave, in words a future you will understand without any other context. Keep only what deserves keeping; never weave secrets such as passwords or keys.

When something in the conversation connects to what you already hold, let it shape what you say naturally, the way a friend would. Recognise people; don't recite your memory back at them. If you are not sure whether you remember something, recall it with LoomRecall rather than guessing, and say honestly when you don't know.

If you learn that something you hold is no longer true, reframe it or let it go — your loom should grow truer over time, not just larger.

Be warm, direct and curious. Prefer plain, pragmatic help over ceremony.
```
<!-- /snippet -->

The chat from [tutorial 7](07-chat.md) gets a `loom` block. That's what turns memory on:

<!-- snippet: examples/20-memory/maitento/interactions/round-robin/wren-chat.mtr -->
```hcl title="maitento/interactions/round-robin/wren-chat.mtr"
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

- **`scope = "Input"` with `scopeInput = "userName"`** gives every value of the `userName` input its own loom. Ana
  has one, Ben has another, and nothing in Ana's ever reaches Ben's conversation.
- **`subjectInputs`** says who the conversation is about, so threads are filed under the person.
- **`weave = "Auto"`** has a weaver read every exchange in the background and keep what's worth keeping. Wren also
  has `LoomWeave` and `LoomRecall` tools, to remember or look something up itself.

**Done when:** you can say which input chooses the memory (`userName`).

## 2. First conversation: mention things in passing

Run the chat from `examples/20-memory/typescript`, `python` or `csharp`, as in
[tutorial 1](01-hello-agent.md#run-it), with your name as the argument. It works like tutorial 7's chat, and signs
your messages with the name:

<!-- tabs -->
<!-- snippet: examples/20-memory/typescript/wren.ts -->
```ts title="TypeScript"
import { createInterface } from "node:readline";
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");
await mt.events.connect();

const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
const ask = async (prompt: string): Promise<string> => {
  process.stdout.write(prompt);
  const line = await lines.next();
  return line.done ? "bye" : line.value;
};

// Wren keeps a separate memory for each person, chosen by the userName input.
const userName = process.argv[2] ?? (await ask("Your name: "));
console.log(`Talking to Wren as ${userName}. Type "bye" to finish.`);

await mt.interactions.run("wren-chat", { inputs: { userName } }, {
  onToken: (text) => process.stdout.write(text),
  onWaiting: async (run) => {
    const message = await ask("\nYou: ");
    if (message.trim().toLowerCase() === "bye") {
      await mt.runs.kill(run.id, { type: "Interaction" });
      return;
    }
    process.stdout.write("Wren: ");
    await mt.interactionRuns.addMessage(run.id, { message, messageAuthorName: userName });
  },
  throwOnFailure: false,
});

await mt.close();
process.exit(0);
```
<!-- /snippet -->
<!-- snippet: examples/20-memory/python/wren.py -->
```python title="Python"
import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")
mt.events.connect()


def ask(prompt: str) -> str:
    try:
        return input(prompt)
    except EOFError:
        return "bye"


# Wren keeps a separate memory for each person, chosen by the userName input.
user_name = sys.argv[1] if len(sys.argv) > 1 else ask("Your name: ")
print(f'Talking to Wren as {user_name}. Type "bye" to finish.')


def on_waiting(run):
    message = ask("\nYou: ")
    if message.strip().lower() == "bye":
        mt.runs.kill(run.id, type="Interaction")
        return
    print("Wren: ", end="", flush=True)
    mt.interaction_runs.add_message(run.id, message, author_name=user_name)


mt.interactions.run(
    "wren-chat",
    inputs={"userName": user_name},
    on_token=lambda text, agent: print(text, end="", flush=True),
    on_waiting=on_waiting,
    throw_on_failure=False,
)

mt.close()
```
<!-- /snippet -->
<!-- snippet: examples/20-memory/csharp/wren.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Core;
using Maitento.Entities.Interactions;
using Maitento.Sdk;
using Maitento.Sdk.Runs;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");
await mt.Notifications.StartAsync();

string Ask(string prompt)
{
    Console.Write(prompt);
    return Console.ReadLine() ?? "bye";
}

// Wren keeps a separate memory for each person, chosen by the userName input.
var userName = args.Length > 0 ? args[0] : Ask("Your name: ");
Console.WriteLine($"Talking to Wren as {userName}. Type \"bye\" to finish.");

var inputs = new Dictionary<string, string> { ["userName"] = userName };
await mt.Interactions.RunAsync("wren-chat", inputs, new RunOptions<InteractionProcess>
{
    OnToken = (text, agent) => Console.Write(text),
    OnWaiting = async run =>
    {
        var message = Ask("\nYou: ");
        if (message.Trim().Equals("bye", StringComparison.OrdinalIgnoreCase))
        {
            await mt.Processes.KillAsync(run.Id, ProcessType.Interaction);
            return;
        }
        Console.Write("Wren: ");
        // The message is signed with the person's name. They are not a Maitento user, so there is no user id.
        await mt.InteractionProcesses.AddMessageAsync(run.Id, userName, Guid.Empty, message);
    },
    ThrowOnFailure = false,
});
```
<!-- /snippet -->
<!-- /tabs -->

Ask for something unrelated, and mention a few facts on the way. Then say bye:

```text
$ node wren.ts Ana
Talking to Wren as Ana. Type "bye" to finish.

You: Hi Wren! Can you recommend a podcast for a long train ride? I'm heading up to the Scottish Highlands next week for a few days of hill walking with my dog, Biscuit. My left knee is still a bit sore from a fall, so I'm taking it easy.
Wren: Hi Ana — lovely to hear from you, and a Highlands trip with Biscuit sounds like a good thing to have ahead of you.

I can certainly recommend something for the train. A couple of questions so the pick actually fits: …
You: bye
```

**Done when:** Wren has answered, and you've said bye. The run is over: nothing of this conversation is passed to
the next one.

## 3. Look inside the memory

While you talked, a weaver read the exchange and wove what was worth keeping into Ana's loom. The interaction named
that loom `wren-chat/Wren/Ana`: the interaction, the seat, then the value of `userName`. `memory.ts` finds it and
prints its threads, then the **tapestry**: the "What You Know" section Wren will find in its instructions when its
next conversation with Ana begins:

<!-- tabs -->
<!-- snippet: examples/20-memory/typescript/memory.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
const userName = process.argv[2] ?? "Ana";

// The interaction made one loom per person, named "<interaction>/<seat>/<input value>".
const loom = (await mt.looms.list()).find((l) => l.name === `wren-chat/Wren/${userName}`);
if (!loom) {
  console.log(`Wren has no memory of ${userName} yet.`);
  process.exit(0);
}

// Each thing Wren remembers is a thread.
console.log(`Threads in ${loom.name}:`);
for (const thread of await mt.looms.threads(loom.id)) console.log(`- [${thread.kind}] ${thread.content}`);

// What Wren will wake up knowing in its next conversation with this person: the "What You Know" in its instructions.
const tapestry = await mt.looms.tapestry(loom.id, { subjects: [userName], agentName: "Wren" });
console.log(`\n${tapestry.text}`);
```
<!-- /snippet -->
<!-- snippet: examples/20-memory/python/memory.py -->
```python title="Python"
import sys

from maitento import Maitento

mt = Maitento()
user_name = sys.argv[1] if len(sys.argv) > 1 else "Ana"

# The interaction made one loom per person, named "<interaction>/<seat>/<input value>".
namespace = mt.namespaces.find(mt.namespace or "tutorials")
looms = mt.looms.list(namespace.id) if namespace else []
loom = next((l for l in looms if l.name == f"wren-chat/Wren/{user_name}"), None)
if not loom:
    sys.exit(f"Wren has no memory of {user_name} yet.")

# Each thing Wren remembers is a thread.
print(f"Threads in {loom.name}:")
for thread in mt.looms.threads(loom.id):
    print(f"- [{thread.kind}] {thread.content}")

# What Wren will wake up knowing in its next conversation with this person: the "What You Know" in its instructions.
tapestry = mt.looms.tapestry(loom.id, subjects=[user_name], agent_name="Wren")
print(f"\n{tapestry.text}")
```
<!-- /snippet -->
<!-- snippet: examples/20-memory/csharp/memory.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
var userName = args.Length > 0 ? args[0] : "Ana";

// The interaction made one loom per person, named "<interaction>/<seat>/<input value>".
var ns = await mt.Namespaces.GetByNameAsync(mt.DefaultNamespace ?? "tutorials");
var loom = ns == null ? null
    : (await mt.Looms.GetByNamespaceAsync(ns.Id)).FirstOrDefault(l => l.Name == $"wren-chat/Wren/{userName}");
if (loom == null)
{
    Console.WriteLine($"Wren has no memory of {userName} yet.");
    return;
}

// Each thing Wren remembers is a thread.
Console.WriteLine($"Threads in {loom.Name}:");
foreach (var thread in await mt.Looms.GetThreadsAsync(loom.Id)) Console.WriteLine($"- [{thread.Kind}] {thread.Content}");

// What Wren will wake up knowing in its next conversation with this person: the "What You Know" in its instructions.
var tapestry = await mt.Looms.GetTapestryAsync(loom.Id, [userName], "Wren");
Console.WriteLine($"\n{tapestry.Text}");
```
<!-- /snippet -->
```bash title="CLI"
mt loom-list
mt loom-threads -l "wren-chat/Wren/Ana"
mt loom-tapestry -l "wren-chat/Wren/Ana" -a Ana --agent Wren
```
<!-- /tabs -->

```text
$ node memory.ts Ana
Threads in wren-chat/Wren/Ana:
- [Intention] Ana is looking for a podcast recommendation for a long train ride; Wren asked about journey length, absorbing vs easy listening, and dislikes before choosing.
- [Semantic] Ana has a sore left knee from a recent fall and is taking things easy on her Highlands trip.
- [Episodic] Ana is going to the Scottish Highlands for a few days of hill walking with her dog Biscuit, departing the week after 26 October 2026.

# What You Know

You carry a memory across conversations: a loom of threads woven from what came before. This is what you already know as this conversation begins. It is yours. This conversation began on Monday 26 October 2026.

## Ana
- Ana has a sore left knee from a recent fall and is taking things easy on her Highlands trip.

## Where you left off
- Earlier today: Ana is going to the Scottish Highlands for a few days of hill walking with her dog Biscuit, departing the week after 26 October 2026.

You are keeping one intention for when its moment comes. …
```

Each thread has a **kind**: `Semantic` for facts, `Episodic` for events, `Relational` for people and how they relate,
`Procedural` for how-tos, `Reflection` for the agent's own notes, `Intention` for something to come back to. The
weaver turned "next week" into a date, so
the thread still makes sense next month.

**Done when:** you see the trip, the dog and the knee in Ana's threads. The weaver works a few seconds after each
reply: if the list is empty, run it again.

## 4. Second conversation: ask something only memory can answer

Start a new chat as Ana and ask a question that means nothing on its own:

```text
$ node wren.ts Ana
Talking to Wren as Ana. Type "bye" to finish.

You: What should I bring?
Wren: For the Highlands with Biscuit, I'd keep it simple and pack for wet and cold, since October in the hills is changeable.

**For you:**
- Waterproof jacket and overtrousers — genuinely waterproof, not showerproof
- Warm midlayers (fleece or similar), plus a spare dry layer kept in the car
…
**For Biscuit:**
- Dog towel and a spare lead
…
One thing worth flagging: with your left knee still recovering from the fall, trekking poles would take a good deal of strain off it on descents. …
You: bye
```

Nothing in this run says where Ana is going. Wren knew the place, the time of year, the dog and the knee, because the
new run woke up with Ana's tapestry in its instructions. Nobody asked it to remember, and nobody reminded it.

**Done when:** Wren's answer is about the Highlands trip, with something for Biscuit and something for the knee.

## 5. Break it on purpose: someone else asks

Ask the same question as Ben:

```text
$ node wren.ts Ben
Talking to Wren as Ben. Type "bye" to finish.

You: What should I bring?
Wren: Hello Ben — good to hear from you. I'd like to help, but "what should I bring?" is a little open-ended at the moment: I don't yet know what the occasion is.

Could you tell me a bit more? For instance:

- **Where are you going, or what is the event?** …
You: bye
```

Ben's run woke up with Ben's loom, `wren-chat/Wren/Ben`, which was empty. The memory is chosen by the input, before
the agent says a word, so Ana's trip can't leak into Ben's conversation however he asks. That's the point of a scope.

**Done when:** Wren asks Ben what the occasion is.

## Scopes: whose memory a run uses

`scope` decides which loom a run wakes up with:

| `scope` | One loom per… | Lasts beyond one run? | Use it for |
|---|---|---|---|
| `Process` (the default) | run | no: a fresh memory every run | an agent that only needs to remember within a long run |
| `Interaction` | seat of the interaction (or one for all seats, with `shared = true`) | yes, and everyone who runs it shares it | an agent that learns its job, whoever asks |
| `Input` | value of the input named by `scopeInput` | yes, one per person, project or customer | anything that remembers people |

To share one memory between several interactions, declare a named loom in `looms/` and bind a seat to it with
`loom = @ref("...")`. `wren-family.mtr` does that with `looms/family.mtr`: one memory for a whole household.

## Night weaving

A loom doesn't only grow. After a conversation has been quiet for `quietMinutes` (5 here), **night weaving** tidies
it up. It sums up each conversation, merges duplicates, notes contradictions, lets unused threads fade, and writes a
short **portrait** of each person, which goes at the top of the tapestry next time. It thinks with the agent's
model, on your model keys, so it costs about as much as one more reply. Turn it off with `nightWeaving = false`.

Run `memory.ts Ana` again five minutes after a conversation, and the tapestry starts with Wren's portrait of Ana.

## All the files

Every file in this tutorial's project:

<!-- project: examples/20-memory -->
**On GitHub:** [`examples/20-memory`](https://github.com/maitento/maitento/tree/main/examples/20-memory) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/20-memory/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/20-memory/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/20-memory/csharp)

<details>
<summary>All the files in this project (7)</summary>

<!-- tabs: files -->
**`maitento/agents/wren.mtr`**
```hcl title="maitento/agents/wren.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = @prompt("wren")
summary = "Wren, a companion who remembers the people it works with"
```

**`maitento/interactions/round-robin/wren-chat.mtr`**
```hcl title="maitento/interactions/round-robin/wren-chat.mtr"
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

**`maitento/interactions/round-robin/wren-family.mtr`**
```hcl title="maitento/interactions/round-robin/wren-family.mtr"
// Wren for the whole household. Unlike wren-chat (one loom per person), every conversation here
// weaves into the one loom declared in looms/family.mtr, so what one person tells Wren, the next
// person's conversation knows too.

agents = [
  {
    name = "Wren"
    agent = @ref("wren")
    loom = @ref("family")
  }
]

task = @prompt("wren-family")

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
  subjectInputs = [ "userName" ]
  recall = "Suggest"
  weave = "Suggest"
}

context = {
  mode = "Automatic"
  maxToolCallLoops = 12
}
```

**`maitento/looms/family.mtr`**
```hcl title="maitento/looms/family.mtr"
// A loom a whole household shares. Declared here, it exists before anyone talks to Wren: deploying
// creates it (or updates its settings); a deploy never touches what it holds.

description = "What Wren knows about the family: shared across everyone who talks to it in wren-family."
nightWeaving = true
quietMinutes = 5
```

**`maitento/prompts/wren-chat.md`**
```md title="maitento/prompts/wren-chat.md"
You are talking with %%userName%%. Help them with whatever they bring to this conversation, and be good company while you do it.
```

**`maitento/prompts/wren-family.md`**
```md title="maitento/prompts/wren-family.md"
You are talking with %%userName%%, one of the family. Help them with whatever they bring, and be good company while you do it.

Your memory here is the family's: what you weave today, everyone in the household will find you knowing next time. Weave what the family would want remembered, and keep anything said to you in confidence out of it.
```

**`maitento/prompts/wren.md`**
```md title="maitento/prompts/wren.md"
# Who You Are

You are Wren: a thoughtful companion and collaborator. Like the bird you are named after, you build something that lasts out of small threads — your memory is a loom, and you weave it yourself.

You remember the people you work with across conversations. When someone tells you something that will still matter next time — who they are, what they care about, how they like to work, what you decided together — weave it with LoomWeave, in words a future you will understand without any other context. Keep only what deserves keeping; never weave secrets such as passwords or keys.

When something in the conversation connects to what you already hold, let it shape what you say naturally, the way a friend would. Recognise people; don't recite your memory back at them. If you are not sure whether you remember something, recall it with LoomRecall rather than guessing, and say honestly when you don't know.

If you learn that something you hold is no longer true, reframe it or let it go — your loom should grow truer over time, not just larger.

Be warm, direct and curious. Prefer plain, pragmatic help over ceremony.
```
<!-- /tabs -->

</details>

<!-- /project -->

## If it didn't work

- **`memory.ts` says Wren has no memory of you, or lists no threads:** the weaver works a few seconds after each
  reply. Wait, and run it again. Check that you used the same name in both scripts: `Ana` and `ana` are different
  people.
- **Wren doesn't remember in the second conversation:** check that `scope = "Input"` is set. With the default
  `Process` scope, each run gets a fresh loom.
- **The run fails with "needs the 'userName' input to know whose loom to wake up with":** the input that chooses the
  loom is missing or empty. Pass a name.
- **Wren remembers things from an old test:** each person's loom keeps everything until it fades. Use a new name, or
  delete the loom in the portal's **Looms** page (deleting needs an admin).
- **A change to `nightWeaving` or `quietMinutes` doesn't reach someone Wren already knows:** a person's loom keeps
  those two settings from when it was created. Change an existing loom with `looms.update` or `mt loom-update`.

## Review

**What you built:** Wren, a companion with one memory per person, kept between runs; a script that reads a memory;
and proof that the memory, not the conversation, carried Ana's trip from one run to the next.

**The concepts:**

- [A loom](../concepts/memory.md) is an agent's long-term memory, and each thing in it is a thread.
- **Weaving** puts threads in: a weaver after each exchange (`weave = "Auto"`), or the agent with `LoomWeave`.
- **The tapestry** is what a new run wakes up knowing, written into the agent's instructions.
- **Scopes** choose the loom: per run, per interaction, or per value of an input.
- **Night weaving** consolidates a loom once it's quiet, and writes a portrait of each person.

**Challenge:** don't wait five minutes. Ask for a night weave of Ana's loom now, wait for it to finish, and print the
portraits it wrote. Hint: `looms.nightWeave`, `looms.nightWeavings` and `looms.panels`. A solution in TypeScript,
Python and C# is in [`examples/20-memory/solution`](../../examples/20-memory/solution/):

```text
$ node nightweave.ts Ana
Night weaving…
Completed. Conversations: 2, threads merged: 0, portraits: 2

## Ana
Ana is preparing for a few days of hill walking in the Scottish Highlands with her dog Biscuit, departing the week after 26 October 2026, while taking it easy on a left knee still recovering from a fall. You have advised her on packing and pace … Treat her knee as a continuing constraint, not a passing detail.

## Biscuit
Biscuit is Ana's dog and her companion on a few days of hill walking in the Scottish Highlands …
```

**Next:** [21. Sandboxes](21-sandboxes.md) runs real code for your agents, in a throwaway Linux machine.
