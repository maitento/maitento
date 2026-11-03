---
title: 7. A chat
description: Have a back-and-forth conversation between a person and an agent, and know who each message is recorded as.
sidebar:
  order: 7
---

# 7. A chat

Build a terminal chatbot: you type, the assistant replies, and the conversation goes on until you say bye. Until now
every run took its task, answered once and ended. A chat is one run that stays open and waits for a person between
turns.

> **You'll learn**
>
> - how a round-robin interaction seats a person next to an agent
> - what a run does while it waits for a person, and how your code answers it
> - how a chat ends
> - who each message is recorded as, and how your app can name the person who wrote it
>
> **New concepts:** [round-robin interactions](../concepts/teams.md#round-robin) ·
> [run statuses](../concepts/interactions.md#statuses)
>
> **Builds on:** [5. Watch it think](05-streaming.md)
>
> **Time:** ~15 min · **Cost:** under $0.01 on DeepSeek for a short chat · **Needs:** nothing beyond Get started

## 1. Write the assistant

An ordinary agent:

<!-- snippet: examples/07-chat/maitento/agents/assistant.mtr -->
```hcl title="maitento/agents/assistant.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a helpful assistant. Be friendly and brief."
summary = "A helpful assistant"
```
<!-- /snippet -->

## 2. Seat a person at the table

A one-shot interaction gives one agent one task. A **round-robin** interaction is a table where participants take
turns on one shared conversation, and a person can sit at it too. It lives in `interactions/round-robin/`:

<!-- snippet: examples/07-chat/maitento/interactions/round-robin/chat.mtr -->
```hcl title="maitento/interactions/round-robin/chat.mtr"
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

- `agents` is a list of seats, because a round-robin table can hold several agents. Here there is one.
- `human = { first = true }` puts a person at the table, speaking first.
- `features` are the moves an agent can make on its turn besides answering: pass (`noAction`), ask another agent a
  private question (`directQuestions`), propose a final answer (`solutionProposal`) and vote on one (`voting`). A
  chat needs none of them, so they are all off. The agent's only move is to answer.

With no way to propose a final answer, nothing can finish the run: it carries on until it is stopped. That's what a
chat should do.

**Done when:** your project has `agents/assistant.mtr` and `interactions/round-robin/chat.mtr`.

## 3. Run it and chat

When it's the person's turn, the run stops and waits, with the status `HumanInteractionRequired`. Each time it does,
the run helper calls your `onWaiting` callback. Here it reads a line from the terminal and sends it with
`addMessage`. On "bye" it stops the run instead. The replies stream in through `onToken`, as in
[tutorial 5](05-streaming.md):

<!-- tabs -->
<!-- snippet: examples/07-chat/typescript/chat.ts -->
```ts title="TypeScript"
import { createInterface } from "node:readline";
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// Read what you type, one line at a time.
const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
const ask = async (prompt: string): Promise<string> => {
  process.stdout.write(prompt);
  const line = await lines.next();
  return line.done ? "bye" : line.value;
};

console.log('Chat with the assistant. Type "bye" to finish.');

// The person speaks first, so the run waits for you straight away. Every time it waits, read a line and send it.
// The assistant's replies stream in through onToken.
await mt.interactions.run("chat", {}, {
  onToken: (text) => process.stdout.write(text),
  onWaiting: async (run) => {
    const message = await ask("\nYou: ");
    if (message.trim().toLowerCase() === "bye") {
      await mt.runs.kill(run.id, { type: "Interaction" });
      return;
    }
    process.stdout.write("Assistant: ");
    // No author named, so the message is recorded as the API key's user: you.
    await mt.interactionRuns.addMessage(run.id, { message });
  },
  // Saying bye stops the run, which is not a failure here.
  throwOnFailure: false,
});

await mt.close();
process.exit(0);
```
<!-- /snippet -->
<!-- snippet: examples/07-chat/python/chat.py -->
```python title="Python"
from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")


# Read what you type, one line at a time.
def ask(prompt: str) -> str:
    try:
        return input(prompt)
    except EOFError:
        return "bye"


print('Chat with the assistant. Type "bye" to finish.')


# The person speaks first, so the run waits for you straight away. Every time it waits, read a line and send it.
# The assistant's replies stream in through on_token.
def on_waiting(run):
    message = ask("\nYou: ")
    if message.strip().lower() == "bye":
        mt.runs.kill(run.id, type="Interaction")
        return
    print("Assistant: ", end="", flush=True)
    # No author named, so the message is recorded as the API key's user: you.
    mt.interaction_runs.add_message(run.id, message)


mt.interactions.run(
    "chat",
    on_token=lambda text, agent: print(text, end="", flush=True),
    on_waiting=on_waiting,
    # Saying bye stops the run, which is not a failure here.
    throw_on_failure=False,
)

mt.close()
```
<!-- /snippet -->
<!-- snippet: examples/07-chat/csharp/chat.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Core;
using Maitento.Entities.Interactions;
using Maitento.Sdk;
using Maitento.Sdk.Runs;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// Read what you type, one line at a time.
string Ask(string prompt)
{
    Console.Write(prompt);
    return Console.ReadLine() ?? "bye";
}

Console.WriteLine("Chat with the assistant. Type \"bye\" to finish.");

// The person speaks first, so the run waits for you straight away. Every time it waits, read a line and send it.
// The assistant's replies stream in through OnToken.
await mt.Interactions.RunAsync("chat", options: new RunOptions<InteractionProcess>
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
        Console.Write("Assistant: ");
        // No author named, so the message is recorded as the API key's user: you.
        await mt.InteractionProcesses.AddMessageAsync(run.Id, message);
    },
    // Saying bye stops the run, which is not a failure here.
    ThrowOnFailure = false,
});
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt interaction-start chat
mt interaction-add-message <pid> "What is the capital of Portugal?"
mt interaction-attach <pid> --stream true
mt kill -t Interaction -i <pid>
```
<!-- /tabs -->

The CLI does one step per command: `interaction-start` prints the run's `pid`, `interaction-add-message` sends a
message as you, `interaction-attach` shows the conversation so far and then each reply as it's written (Ctrl+C stops
watching; the run carries on), and `kill` ends the chat.

Run the script from the language's folder in [`examples/07-chat`](../../examples/07-chat/):

<!-- tabs -->
```bash title="TypeScript"
cd examples/07-chat/typescript
npm install
node chat.ts
```
```bash title="Python"
cd examples/07-chat/python
pip install -r requirements.txt
python chat.py
```
```bash title="C#"
cd examples/07-chat/csharp
dotnet run chat.cs
```
<!-- /tabs -->

**Done when:** you can ask two questions, the second one building on the first, and "bye" ends the script:

```text
Chat with the assistant. Type "bye" to finish.

You: What is the capital of Portugal?
Assistant: The capital of Portugal is Lisbon.
You: And roughly how many people live there?
Assistant: Lisbon has a population of roughly 550,000 people within the city proper. The wider Lisbon metropolitan area is home to approximately 2.9 million people.
You: bye
```

The assistant knew "there" meant Lisbon: it's one run, and every turn sees the whole conversation.

## 4. What the run did

- **It waited for you between messages.** Each time it was your turn, the status became `HumanInteractionRequired`,
  and `run()` called your callback. A waiting run uses no tokens, and the time it waits doesn't count towards the
  interaction's [time limit](../concepts/limits.md).
- **`addMessage` answered it.** The run picked up straight away. A message sent while the agent is still writing is
  queued until its turn.
- **Saying bye killed it.** With no way to propose a final answer, a chat only ends when it's stopped, so the run's
  final status is `Killed`. That's why the script sets `throwOnFailure: false`: by default, a run that ends `Killed`
  or `Error` throws. A chat nobody stops isn't left open forever: after three days of waiting for a person, Maitento
  closes it as `Finished`.

## 5. Who said it

Every message in a run is saved with its **author**: a name and an id. The agents see the name too: each message
reaches the model as `Ana (Human User): …`. Who the author is depends on how your code signs in:

| Your code calls Maitento with | The message is recorded as |
|---|---|
| an API key, naming no author | the API key's own user: you |
| an API key, naming an author | exactly the name and id you give |
| a person's own sign-in (the portal, or `mt api-login user`) | always that person; any author you name is ignored |

Why the difference? An app that talks to Maitento for its users does it with one API key, so it is allowed to say
which of its users wrote each message. The id is **yours**, not a Maitento id: your app's id for that person, or any
GUID you like. If you name someone without an id, the id is recorded as all zeros. A person signed in as themselves
can only ever speak as themselves.

Naming an author looks like this:

<!-- tabs -->
```ts
await mt.interactionRuns.addMessage(run.id, { message: "Hello", messageAuthorName: "Ana", messageAuthorId: "3f2c8a51-6d0e-4b8e-9a4b-2f1d7c9e5a10" });
```
```python
mt.interaction_runs.add_message(run.id, "Hello", author_name="Ana", author_id="3f2c8a51-6d0e-4b8e-9a4b-2f1d7c9e5a10")
```
```csharp
await mt.InteractionProcesses.AddMessageAsync(run.Id, "Ana", Guid.Parse("3f2c8a51-6d0e-4b8e-9a4b-2f1d7c9e5a10"), "Hello");
```
```bash
mt interaction-add-message <pid> "Hello" --author-name "Ana" --author-id 3f2c8a51-6d0e-4b8e-9a4b-2f1d7c9e5a10
```
<!-- /tabs -->

The author is optional in all of them. Leave it out, as the script does, and the message is recorded as you. The CLI
can also remember an author for every message you send from it: `mt interaction-author-defaults-set "Ana" <id>`
saves one, and `mt interaction-author-defaults-clear` forgets it.

## All the files

<!-- project: examples/07-chat -->
**On GitHub:** [`examples/07-chat`](https://github.com/maitento/maitento/tree/main/examples/07-chat) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/07-chat/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/07-chat/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/07-chat/csharp)

<details>
<summary>All the files in this project (2)</summary>

<!-- tabs: files -->
**`maitento/agents/assistant.mtr`**
```hcl title="maitento/agents/assistant.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a helpful assistant. Be friendly and brief."
summary = "A helpful assistant"
```

**`maitento/interactions/round-robin/chat.mtr`**
```hcl title="maitento/interactions/round-robin/chat.mtr"
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
<!-- /tabs -->

</details>

<!-- /project -->

## Break it on purpose

Delete the `throwOnFailure: false` line (`throw_on_failure=False` in Python, `ThrowOnFailure = false` in C#), chat,
and say bye:

<!-- tabs -->
```text title="TypeScript"
ProcessFailedError: Interaction run 6422bf07-1913-4e6c-8a42-391b49d42f11 ended Killed.
```
```text title="Python"
maitento.errors.ProcessFailedError: Interaction run 6422bf07-1913-4e6c-8a42-391b49d42f11 ended Killed.
```
```text title="C#"
Unhandled exception. Maitento.Sdk.Exceptions.MaitentoProcessFailedException: Interaction run 6422bf07-1913-4e6c-8a42-391b49d42f11 ended Killed.
```
<!-- /tabs -->

The chat worked; only its ending changed. `run()` treats `Killed` like `Error`, because for most runs being stopped
means the work wasn't done. A chat has no other way to end, so here `Killed` is the normal finish, and the script
says so.

## If it didn't work

- **Saying bye ends with `Interaction run <id> ended Killed.`**: `throwOnFailure: false` is missing. See
  above.
- **CLI: `Expected the message after the run's id, in quotes`**: a message of several words needs quotes around it:
  `mt interaction-add-message <pid> "your message"`.
- **`No namespace`**, **`Project folder not found: ../maitento`**, **`[api:model-keys:none-for-provider]`**: see
  [tutorial 1](01-hello-agent.md#if-it-didnt-work).

## Review

You built:

- a round-robin interaction with a person at the table, and the agent's other moves switched off;
- a script that answers the run each time it waits, streams the replies, and stops the run on "bye";
- messages recorded as the API key's user, and you know how to record them as one of your app's users instead.

The concepts:

- [Round-robin interactions](../concepts/teams.md#round-robin): participants take turns on one conversation; a
  person can sit at the table with `human`.
- [Run statuses](../concepts/interactions.md#statuses): `HumanInteractionRequired` means the run is waiting for a
  person; `Killed` means it was stopped.
- Message authors: with an API key your code may name the author (a name and your own id); a signed-in person is
  always recorded as themselves.

**Challenge:** make the chat record each message as the person typing it. Ask for a name when the script starts,
send every message with that name and an id from "your app", and at the end print who said what, as the run
recorded it: the run's `context.humanMessage` list (`human_message` in Python, `HumanMessage` in C#), each with its
`author`. The solution is in
[`examples/07-chat/solution`](../../examples/07-chat/solution/).

**Next:** [8. Your first tool](08-first-tool.md) lets the agent look something up.
