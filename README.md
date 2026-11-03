<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/logo-horizontal-on-dark-1200.png">
    <img src="docs/assets/brand/logo-horizontal-on-light-1200.png" alt="maitento" width="360">
  </picture>
</p>

# Maitento

Maitento is an AI operating system. You describe agents, their tools and how they work together as plain files,
deploy them, and run them from your own code. Maitento handles the rest: the model calls, conversations between
agents, calls to the web and to your APIs, memory, files, sandboxes and schedules.

This repository has the SDKs, the examples and the documentation. **Read the docs at
[docs.maitento.com](https://docs.maitento.com)**. The same pages are in [`docs/`](docs/index.md).

## Hello, how are you?

Two small files in a folder called `maitento`. The first is an agent, a model and its instructions:

```hcl
// maitento/agents/greeter.mtr
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a friendly assistant. Keep every answer to one or two sentences."
summary = "A friendly assistant"
```

The second is an interaction, a job that puts the agent to work:

```hcl
// maitento/interactions/one-shot/hello.mtr
agent = {
  name = "Greeter"
  agent = @ref("greeter")
}
task = "Hello, how are you?"
```

Deploy the folder and run the interaction:

```ts
import { Maitento } from "@maitento/sdk";

const mt = new Maitento(); // reads MAITENTO_API_KEY and MAITENTO_NAMESPACE
await mt.deploy("../maitento");
const run = await mt.interactions.run("hello");
console.log(run.output);
```

```python
from maitento import Maitento

mt = Maitento()  # reads MAITENTO_API_KEY and MAITENTO_NAMESPACE
mt.deploy("../maitento")
run = mt.interactions.run("hello")
print(run.output)
```

[Get started](docs/get-started/index.md) takes you from signing up to this running, in five short steps.

## Install

| | |
|---|---|
| TypeScript and JavaScript | `npm install @maitento/sdk` |
| Python | `pip install maitento` |
| C# | `dotnet add package Maitento.Sdk` |
| The `mt` command line | `dotnet tool install --global Maitento.Shell` |

Any other language can call the HTTP API directly: every call in the [API reference](docs/reference/index.md) has a
curl example.

## Build with an AI coding agent

Coding agents haven't seen Maitento's project files or Cogniscript before. The Maitento skill teaches them both, and
how to deploy. In Claude Code:

```text
/plugin marketplace add maitento/maitento
/plugin install maitento@maitento
```

For Codex, Cursor, GitHub Copilot, Gemini CLI and other agents, copy [`skills/maitento/`](skills/maitento/SKILL.md)
into `~/.agents/skills/`. [Build with an AI coding agent](docs/guides/ai-coding-agents.md) has the steps for each.

## What's here

| Folder | What it holds |
|---|---|
| [`docs/`](docs/index.md) | The documentation: get started, tutorials, concepts and the API reference |
| [`examples/`](examples/README.md) | The code for every tutorial, from a one-line agent to code pipelines, in TypeScript, Python and C# |
| [`sdks/typescript/`](sdks/typescript/README.md) | `@maitento/sdk`, the TypeScript and JavaScript SDK |
| [`sdks/python/`](sdks/python/README.md) | `maitento`, the Python SDK |
| [`editors/vscode/`](editors/vscode/README.md) | A VS Code extension for project files (`.mtr`): highlighting, completion, hover help and errors as you type |
| [`skills/maitento/`](skills/maitento/SKILL.md) | The Maitento skill, which teaches AI coding agents to write and deploy Maitento projects |
| [`.claude-plugin/`](.claude-plugin/marketplace.json) | This repository as a Claude Code plugin marketplace, so `/plugin install maitento@maitento` finds the skill |

The C# SDK and the `mt` command line are published to NuGet as `Maitento.Sdk` and `Maitento.Shell`.

## Access

[Sign up](https://app.maitento.com/signup) for a tenant on the Free plan. See [Get access](docs/get-started/1-access.md).

## Licence

The SDKs, examples and documentation in this repository are licensed under the [Apache License 2.0](LICENSE). The
Maitento service itself is used under its own terms.

This repository is a snapshot published with each SDK release. To report a security problem, see
[SECURITY.md](SECURITY.md).
