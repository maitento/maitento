# Agents

An **agent** is a reusable persona: the model it runs on, its standing instructions, a one-line summary, and the
tools it may call. An agent does nothing on its own; an [interaction](interactions.md) puts it to work. Concept page:
`docs/concepts/agents.md`. Every property: `docs/reference/project-files/agents.md`.

## Properties

<!-- mtr-properties: agent -->
| Property | Required | What it does |
|---|---|---|
| `model` | yes | the model, `@ref("<provider>.<model>")`. `mt aimodel-list` lists the names; the tenant needs a model key for that provider |
| `prompt` | yes | standing instructions (the system prompt). Use `@prompt("name")` for anything long. Run inputs are **not** filled in here |
| `summary` | yes | one line describing it to other agents: a router or a manager chooses by it |
| `functions` | no | the tools it may call: `[ { ref = @ref("tool-name") } ]` |
| `allowWebSearch`, `allowWebFetch` | no | Maitento's built-in web tools (see [knowledge and memory](knowledge-and-memory.md#web-tools)) |
| `routedSubAgents` | no | makes it a **router** that hands each turn to one of these agents |
| `allowSwarm` | no | lets it start other interactions as sub-runs (see [interactions](interactions.md#sub-interactions)) |

## An agent with a tool

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

The tool itself is in [tools](tools.md). A tool can also be given to every agent in one interaction with the
interaction's `functions.openApi`, instead of to the agent.

## A router

A router never answers. On each turn it reads its specialists' `summary` lines, and its own `prompt` as the rule for
choosing, and hands the turn to one of them. The first is the fallback when its choice can't be used.

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

- **A router always picks someone.** If a question may fit no specialist, put a general agent in the list.
- **Write the specialists' `summary` lines for the router**: they are what it chooses by.
- Each choice is recorded on the run in `routingDecisions`. Routers don't get web tools.

Example: `examples/06-routed-agents/`. Tutorial: `docs/tutorials/06-routed-agents.md`.

## Good to know

- **The prompt is who the agent is; the task is what to do now.** Put the job's instructions in the interaction's
  `task`, which is also where `%%inputs%%` are filled in.
- **One agent, many interactions.** The same agent can sit in any number of them.
- **Changing an agent adds a version.** An interaction keeps the agent version it was deployed with until it's
  deployed again, so deploy the whole project folder after changing an agent.
- **A model needs a key.** A run whose agent's provider has no model key in the tenant ends `Error` with
  `api:model-keys:none-for-provider`. `mt doctor <project folder>` checks every agent's model before you run.
