---
title: Tutorials
description: Twenty-four short projects, from a one-line hello to code pipelines and a support desk, each one building on the last, and a track that teaches Cogniscript.
sidebar:
  label: Overview
  order: 0
---

# Tutorials

Each tutorial is a small, complete project that runs. Start at the top: every one adds one idea to the ones before
it. All the code is in [`examples/`](../../examples/), in TypeScript, Python and C#.

| # | Tutorial | You'll learn |
|---|---|---|
| 1 | [Hello, agent](01-hello-agent.md) | agents, interactions, deploying, running |
| 2 | [Prompts and inputs](02-prompts-and-inputs.md) | prompt files, inputs, optional text |
| 3 | [Typed answers](03-typed-answers.md) | JSON answers that match a schema |
| 4 | [Runs](04-runs.md) | starting a run without waiting, its status, listing and cancelling runs |
| 5 | [Watch it think](05-streaming.md) | streaming the reply as it's written |
| 6 | [Routed agents](06-routed-agents.md) | a router that hands each question to the right specialist |
| 7 | [A chat](07-chat.md) | conversations with a person |
| 8 | [Your first tool](08-first-tool.md) | letting an agent call an API |
| 9 | [Call your code](09-call-your-code.md) | tools on your own server, secrets |
| 10 | [Approvals](10-approvals.md) | a person approving a tool call before it happens |
| 11 | [Know when it's done](11-webhooks.md) | webhooks |
| 12 | [Live events](12-live-events.md) | following your runs live over one WebSocket |
| 13 | [Your documents](13-your-documents.md) | knowledge bases (RAG) |
| 14 | [Search the web](14-web-research.md) | built-in web search and fetch |
| 15 | [Files for agents](15-files-for-agents.md) | virtual file systems |
| 16 | [Apps](16-apps.md) | apps that orchestrate agents |
| 17 | [On a schedule](17-on-a-schedule.md) | automations |
| 18 | [Sub-interactions](18-sub-interactions.md) | agents that start other agents, in parallel |
| 19 | [Managed teams](19-managed-teams.md) | a manager that hands out work, and which team pattern to use |
| 20 | [Memory](20-memory.md) | agents that remember people |
| 21 | [Sandboxes](21-sandboxes.md) | running code in a capsule |
| 22 | [Code pipelines](22-code-pipelines.md) | AI coding agents on your git repo |
| 23 | [Support desk](23-support-desk.md) | all of it together in a support console you can deploy |
| 24 | [Your customers' keys](24-customer-credentials.md) | credentials and credential stacks: each customer on its own key |

## Learn Cogniscript

After [tutorial 16](16-apps.md), a separate track teaches the language apps and code pipeline hooks are written in,
in six short lessons: values, decisions and loops, functions, JSON, errors, and orchestration patterns.
[Learn Cogniscript](cogniscript/index.md) has the list. The first five make no AI calls, so they cost nothing.

## Before you start

Finish [Get started](../get-started/index.md) first. You need:

- an API key, in the `MAITENTO_API_KEY` environment variable;
- a namespace for the tutorials, in `MAITENTO_NAMESPACE`. We use `tutorials`;
- a **DeepSeek** [model key](../concepts/models-and-keys.md), because the tutorial agents use DeepSeek's
  `deepseek-v4-flash`. To use another provider, change `model` in each agent file to a model you have a key for.

Each tutorial's code deploys its own project, so you can run them in any order once you've done the first. Two build
on the one before: tutorial 10 uses tutorial 9's orders API and secret, and tutorial 17 schedules tutorial 16's app.

## Running the code

<!-- tabs -->
```bash title="TypeScript"
# Node.js 22.18 or later runs TypeScript directly.
cd examples/01-hello-agent/typescript
npm install
node hello.ts
```
```bash title="Python"
# Python 3.10 or later.
cd examples/01-hello-agent/python
pip install -r requirements.txt
python hello.py
```
```bash title="C#"
# The .NET 10 SDK runs a single .cs file directly.
cd examples/01-hello-agent/csharp
dotnet run hello.cs
```
```bash title="CLI"
# The mt command line. Installing it needs the .NET SDK, 8 or later.
dotnet tool install --global Maitento.Shell
cd examples/01-hello-agent
mt deploy ./maitento
mt interaction-run hello
```
<!-- /tabs -->

The CLI tab's `mt` reads the same `MAITENTO_API_KEY` and `MAITENTO_NAMESPACE`; see
[The mt command line](../reference/cli/index.md). `mt init hello --example 01-hello-agent` copies a tutorial's example
into a new folder, so you don't need the repository.
