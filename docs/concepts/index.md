---
title: How Maitento works
description: The few ideas everything else builds on, on one page.
sidebar:
  label: Overview
  order: 0
---

# How Maitento works

Maitento runs AI agents for you. You describe *what* should happen in small text files, deploy them, and then start
runs from your own code. Maitento does the rest: it calls the models, runs the tools, keeps the conversation,
remembers, retries, and tells you when a run is done.

There are only a handful of ideas to learn.

## Definitions and runs

Everything in Maitento is either a **definition** or a **run**.

- A **definition** describes something: an agent, an interaction, a tool, an app. You write definitions as files and
  [deploy](projects-and-deploys.md) them. Every deploy that changes a definition creates a new, numbered version.
- A **run** (Maitento also calls it a *process*) is one execution of a definition. You start a run by name, it gets
  an id, and it moves through statuses such as `Running` and `Finished`.

![Definitions are files you write and deploy, such as an agent, an interaction, an app, a capsule or a code pipeline, and each deploy that changes one adds a version. You start one by name, which makes a run: it has an id, moves from Running to Finished, and ends with an output.](../assets/diagrams/definitions-and-runs.svg)

## The building blocks

| You want to… | Use | Read |
|---|---|---|
| Give a model a role and instructions | an **agent** | [Agents](agents.md) |
| Put agents to work on a task | an **interaction** | [Interactions](interactions.md) |
| Get JSON back instead of prose | a **response schema** | [Structured output](structured-output.md) |
| Let an agent call an API, including yours | a **tool** | [Tools](tools.md) |
| Let an agent search and read the web | **web tools** | [Web tools](web-tools.md) |
| Answer from your own documents | a **knowledge base** | [Knowledge](knowledge.md) |
| Give agents and sandboxes files | a **virtual file system** | [File systems](file-systems.md) |
| Have several agents work together | **teams** | [Teams of agents](teams.md) |
| Let an agent remember people across runs | **memory** | [Memory](memory.md) |
| Write logic around your agents | an **app** | [Apps](apps.md) |
| Write an app's code, or a code pipeline's hooks | the **Cogniscript** language | [Cogniscript](cogniscript.md) |
| Run code in a throwaway Linux machine | a **capsule** | [Capsules](capsules.md) |
| Run coding agents on a git repo | a **code pipeline** | [Code pipelines](code-pipelines.md) |
| Start things on a schedule | an **automation** | [Automations](automations.md) |

The [tutorials](../tutorials/index.md) introduce these one at a time, and
[tutorial 23, Support desk](../tutorials/23-support-desk.md) puts most of them together in one small web app.

## Namespaces

Definitions live in a **namespace**, a named folder for one project. A namespace is created the first time you deploy
to it. Names only need to be unique within a namespace, so two projects can both have an agent called `assistant`.

## Your tenant, your keys

Your organisation is a **tenant**. Everyone in it signs in to the [portal](https://app.maitento.com) and can create
**API keys** for code. Maitento runs agents on **your own account with the model provider**: you add a
[model key](models-and-keys.md) once, and every run uses it. To run different work on different accounts, such as
each of your customers on their own key, use [credentials and credential stacks](credentials.md).

## Talking to Maitento

There are four ways in, and they all do the same things:

- The **portal**, a web console where you write, deploy and watch everything.
- The **SDKs** for TypeScript, Python and C#.
- The **`mt` command line**, in your terminal or in the portal's cloud shell: see [The shell](shell.md).
- The **REST API**, if your language has no SDK. Every API page shows the curl command.

## Knowing when a run is done

Runs take seconds to minutes. You can wait for one in three ways, described in [Runs and events](runs-and-events.md):

- the SDKs' `run()` helpers, which start a run and wait for it;
- live **events** over a WebSocket, including the model's reply as it streams;
- **webhooks**, where Maitento calls your server when a run changes.
