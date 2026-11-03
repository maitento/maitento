---
title: Maitento
description: Maitento is an AI operating system. Describe agents and what they can do as plain files, deploy them, and run them from your code.
template: splash
hero:
  title: An operating system for AI agents
  tagline: Maitento runs AI agents for you. Describe your agents, their tools and how they work together as plain files, deploy them, and call them from your own code.
  actions:
    - text: Get started
      link: /get-started/
      variant: primary
      icon: right-arrow
    - text: Sign up free
      link: https://app.maitento.com/signup
      variant: secondary
---

# Maitento

Maitento is an AI operating system. Everything an agent needs runs on Maitento: the model calls, conversations
between agents, tool calls to the web and to your own APIs, memory, files and schedules. Your code stays small:
deploy a folder, run a task, read the answer, from TypeScript, Python, C# or the `mt` command line.

## Hello world in 60 seconds

**1. Describe an agent and a task.** Two small files, in a folder called `maitento`:

<!-- snippet: examples/01-hello-agent/maitento/agents/greeter.mtr -->
```hcl title="maitento/agents/greeter.mtr"
// The model this agent runs on. See the names you can use with `mt aimodel-list`.
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a friendly assistant. Keep every answer to one or two sentences."
summary = "A friendly assistant"
```
<!-- /snippet -->

<!-- snippet: examples/01-hello-agent/maitento/interactions/one-shot/hello.mtr -->
```hcl title="maitento/interactions/one-shot/hello.mtr"
// A one-shot interaction: one agent, one task, one answer.
agent = {
  name = "Greeter"
  agent = @ref("greeter")
}
task = "Hello, how are you?"
```
<!-- /snippet -->

**2. Deploy them and run the task.** Set `MAITENTO_API_KEY` to your API key and `MAITENTO_NAMESPACE` to a namespace
name first.

<!-- tabs -->
<!-- snippet: examples/01-hello-agent/typescript/hello.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

// Reads your API key and namespace from MAITENTO_API_KEY and MAITENTO_NAMESPACE.
const mt = new Maitento();

// Send the agent and the interaction in ../maitento to Maitento.
await mt.deploy("../maitento");

// Start the "hello" interaction and wait for its answer.
const run = await mt.interactions.run("hello");
console.log(run.output);
```
<!-- /snippet -->
```python title="Python"
from maitento import Maitento

mt = Maitento()  # reads MAITENTO_API_KEY and MAITENTO_NAMESPACE
mt.deploy("../maitento")

run = mt.interactions.run("hello")
print(run.output)
```
<!-- snippet: examples/01-hello-agent/csharp/hello.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

// Reads your API key and namespace from MAITENTO_API_KEY and MAITENTO_NAMESPACE.
await using var mt = MaitentoClient.CreateFromEnvironment();

// Send the agent and the interaction in ../maitento to Maitento.
await mt.DeployAsync("../maitento");

// Start the "hello" interaction and wait for its answer.
var run = await mt.Interactions.RunAsync("hello");
Console.WriteLine(run.Output);
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt interaction-run hello
```
<!-- /tabs -->

**3. Read the answer.** The run comes back finished, with the agent's reply in `output`:

```text
I am well, thank you for asking. How may I assist you with your task today?
```

## Next steps

- [Get started](get-started/index.md) takes you from signing up to your first agent, step by step.
- [The tutorials](tutorials/index.md) build up, one idea at a time, from this hello to code pipelines and a small
  support desk.
- [Build with an AI coding agent](guides/ai-coding-agents.md): give Claude Code, Codex or Cursor the Maitento skill,
  so it writes and deploys Maitento projects for you.
- [Sign up](https://app.maitento.com/signup) to get a tenant on the Free plan.
