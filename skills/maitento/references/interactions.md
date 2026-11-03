# Interactions

An **interaction** is the thing you run. It names the agents taking part, the task, the inputs the task needs, and
optionally the tools, the shape of the answer and the limits. Starting one creates a **run**; when it finishes, the
answer is in its `output`. Concept pages: `docs/concepts/interactions.md`, `docs/concepts/structured-output.md`,
`docs/concepts/teams.md`.

| Kind | Folder | Who takes part | Use it for |
|---|---|---|---|
| one-shot | `interactions/one-shot/` | one agent | a question, a task, an extraction: one answer |
| round-robin | `interactions/round-robin/` | agents, and optionally a person, taking turns | chats, reviews, debates |
| managed | `interactions/managed/` | a manager and the team it hands work to | work that splits into parts |

Every property of each kind: `docs/reference/project-files/interactions-one-shot.md`,
`docs/reference/project-files/interactions-round-robin.md` and `docs/reference/project-files/interactions-managed.md`.

## The properties every kind shares

<!-- mtr-properties: interaction-one-shot -->
| Property | What it does |
|---|---|
| `task` | what to do now; `%%name%%` fills in an input. Use `@prompt("name")` for anything long |
| `inputs.prompts` | the run's inputs: `[ { name description required type } ]`; `type` is `String` (default), `Integer`, `Decimal` or `Boolean` |
| `inputs.functions.binding` | run values that go straight into a tool call, never seen by the model (see [tools](tools.md#values-from-the-run)) |
| `inputs.functions.auth` | a run input naming the secret a tool sends (see [tools](tools.md#secrets)) |
| `functions.openApi` | tools for every agent in the interaction: `[ { name ref } ]` |
| `schema.solution` | a JSON Schema the answer must match: `@json("name")` |
| `prompts.system`, `prompts.system.mode` | extra system instructions for every agent |
| `duration.warn`, `duration.max` | a warning to the agents, and a hard time limit, as `"hh:mm:ss"` |
| `context` | how a long conversation is trimmed or compacted (`docs/concepts/limits.md`) |
| `loom` | long-term memory (see [knowledge and memory](knowledge-and-memory.md#memory)) |
| `credentialStack` | which model credentials the run uses (`docs/concepts/credentials.md`) |
| `swarm` | the interactions its agents may start as sub-runs |

A one-shot sits its agent in `agent = { name agent }`. Round-robin and managed interactions list `agents`, and a
managed one also has a `manager`.

## Inputs

<!-- snippet: examples/02-prompts-and-inputs/maitento/interactions/one-shot/haiku.mtr -->
```hcl title="interactions/one-shot/haiku.mtr"
agent = {
  name = "Poet"
  agent = @ref("poet")
}
task = @prompt("haiku-task")
inputs.prompts = [
  {
    name = "topic"
    description = "What the haiku is about"
    required = true
  },
  {
    name = "mood"
    description = "Optional mood, for example calm or playful"
    required = false
  }
]
```

- A run without a required input is refused before it starts: `api:interactions:input-required`. An input the
  interaction doesn't declare: `api:interactions:input-unknown`. A value of the wrong type:
  `api:interactions:input-invalid`. Nothing is spent on a refused run.
- Names are case-sensitive in the API and the SDKs; `mt` takes them in lower case (`--input-topic`).
- `{{#if mood}}…{{/if}}` in the task keeps its text only when `mood` has a value.

## Structured output

Point `schema.solution` at a JSON Schema in `json/`, and the run's `output` is a JSON string that matches it. With
models that support it the schema constrains the answer; every answer is checked, and after the third that doesn't
match the run ends `Error` ("Unable to parse JSON result"). Example: `examples/03-typed-answers/`.

- Set `"additionalProperties": false` on every object and list every property in `required`.
- For something that may be missing, allow `null` (`"type": ["integer", "null"]`) instead of leaving it out of
  `required`, or the model has to invent a value.
- Describe fields with `"description"`; keep the schema to what your code needs.

## Statuses

| Status | Means |
|---|---|
| `New` | accepted, waiting for a worker or a free lane |
| `Running` | working |
| `HumanInteractionRequired` | waiting for a person to send a message |
| `HumanInteractionComplete` | a person replied; waiting for a worker to carry on |
| `PendingApproval` | waiting for a person to approve a tool call (`pendingApproval` says which) |
| `AwaitingChildren` | waiting for sub-interactions it started |
| `Finished` | done: the answer is in `output` |
| `Error` | failed or timed out: the reason is in `failureDetails` |
| `Killed` | stopped by someone, or because its parent run was stopped |

## Starting a run

```bash
mt interaction-run haiku --input-topic "autumn rain" --input-mood calm
```

```ts
const run = await mt.interactions.run("haiku", { inputs: { topic: "autumn rain", mood: "calm" } });
console.log(run.output);
```

`run()` starts the run and waits for it; `start()` returns at once with status `New`. More in [SDKs](sdks.md).

## Chats (round-robin with a person)

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

The run waits in `HumanInteractionRequired`; each message is sent with `interactionRuns.addMessage` (SDK) or
`mt interaction-add-message`. With `solutionProposal = false` a chat carries on until it's stopped. After three days
with no message the run is closed as `Finished`, and a later message opens it again. Example: `examples/07-chat/`.

## Managed teams

A manager agent owns the task and sends work to named members with a `Dispatch` tool; members see only what it sends
them. Member `mode`: `OneTime` (fresh each time), `Private` (its own ongoing conversation with the manager) or
`Group` (sees the shared conversation). Set limits: `limits.maxDispatches` (default 30, soft: the manager is told to
finish), `context.maxToolCallLoops` (default 10) and `duration.max` (hard: the run ends `Error`). Example:
`examples/19-managed-teams/`.

## Sub-interactions

An agent can start other interactions as child runs, wait for them and combine the answers. The parent waits in
`AwaitingChildren` without holding a worker. It takes three switches: the interaction lists what may be started under
`swarm`, the agent has `allowSwarm = true`, and the seat is allowed (every seat is by default; `swarm.participants`
narrows it).

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

When the steps must happen the same way every time, use an [app](apps-and-cogniscript.md) instead: an agent decides
for itself how many sub-runs to start.

## Approvals

A tool with `requiresApproval = true` stops the run in `PendingApproval` before each call. Approve it
(`mt interaction-approve <run id>`, `interactionRuns.approve`) and the call is made; reject it with a reason
(`mt interaction-reject <run id> -r "<reason>"`) and the agent is told why and redrafts, which is a new approval with a
new id. Approvals only happen in interactions: a tool that needs one, called from an app, fails. Example:
`examples/10-approvals/`.
