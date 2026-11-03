---
title: Agents
description: An agent is a model with a role, standing instructions, and the tools it may use.
sidebar:
  order: 3
---

# Agents

An **agent** is a reusable AI persona: which model it uses, its standing instructions, a one-line summary, and the
tools it may call. An agent does nothing on its own. An [interaction](interactions.md) puts it to work.

See it in [tutorial 1, Hello, agent](../tutorials/01-hello-agent.md), which writes this agent and runs it, and
[tutorial 2, Prompts and inputs](../tutorials/02-prompts-and-inputs.md), which moves its instructions into a prompt
file.

<!-- snippet: examples/01-hello-agent/maitento/agents/greeter.mtr -->
```hcl title="agents/greeter.mtr"
// The model this agent runs on. See the names you can use with `mt aimodel-list`.
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a friendly assistant. Keep every answer to one or two sentences."
summary = "A friendly assistant"
```
<!-- /snippet -->

## Properties

| Property | Required | What it does |
|---|---|---|
| `model` | yes | The [model](models-and-keys.md) it runs on, as `@ref("<catalogue name>")`. |
| `prompt` | yes | Its standing instructions (the *system prompt*). Use `@prompt("name")` for anything long. |
| `summary` | yes | One line that describes it to other agents: a router choosing who answers, or a manager choosing who to hand work to. |
| `functions` | no | The [tools](tools.md) it may call: `[ { ref = @ref("tool-name") } ]`. |
| `allowWebSearch`, `allowWebFetch` | no | Gives it Maitento's built-in [web tools](web-tools.md), as in [tutorial 14](../tutorials/14-web-research.md). |
| `routedSubAgents` | no | Makes it a **router** that picks another agent to answer each turn. See [Teams](teams.md#routers) and [tutorial 6](../tutorials/06-routed-agents.md). |
| `allowSwarm` | no | Lets it start other interactions as sub-runs. See [Teams](teams.md#sub-interactions) and [tutorial 18](../tutorials/18-sub-interactions.md). |

## An agent with a tool

From [tutorial 8, Your first tool](../tutorials/08-first-tool.md):

<!-- snippet: examples/08-first-tool/maitento/agents/weather-bot.mtr -->
```hcl title="agents/weather-bot.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You answer questions about the weather. Always check the current weather with your tool before you answer."
summary = "Answers weather questions"
functions = [
  {
    ref = @ref("current-weather")
  }
]
```
<!-- /snippet -->

## Good to know

- **Write the prompt for the job, not the task.** The agent's `prompt` says who it is and how it behaves. The thing
  to do right now goes in the interaction's `task`, which is also where run inputs such as `%%city%%` are filled in.
  Inputs are **not** filled in inside an agent's prompt.
- **One agent, many interactions.** The same agent can sit in any number of interactions.
- **Changing an agent** creates a new version. Interactions keep using the version they were deployed with until you
  deploy them again, so deploy the whole project folder after a change.
