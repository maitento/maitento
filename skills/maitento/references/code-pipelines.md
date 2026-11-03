# Code pipelines

A **code pipeline** runs AI **coding** agents (Claude Code, Codex, Gemini CLI and others) on your git repositories.
Maitento clones the repositories into a sandbox, runs each step with the coding tool you chose, commits the work and
pushes a branch. It never opens a pull request or merges for you. Concept page: `docs/concepts/code-pipelines.md`.
Every field of the definition: `docs/reference/types/code-pipeline-create-request.md`,
`docs/reference/types/code-pipeline-phase-definition.md`, `docs/reference/types/code-pipeline-step-definition.md` and
`docs/reference/types/code-pipeline-agent.md`. Your plan must include code pipelines (`api:billing:premium-not-included`
otherwise).

A pipeline is made of:

- **agents**, each driven by an **engine** (a coding tool) and optionally a model;
- **phases**, which run in order or in parallel depending on what they wait for (`dependsOn`);
- **steps**, each one prompt to one agent. A step can commit, keep its reply in a variable for later steps, return
  structured JSON, or stop and ask a person a question;
- **hooks**: Cogniscript functions that run before or after a phase or step. A phase's post hook decides what runs
  next.

## The definition

A pipeline is a folder, `code-pipelines/<name>/`, holding `pipeline-definition.json`. Its `name` must be the folder's
name. Prompts go in the folder's `prompts/` and are included as `"@prompt(name)"`; schemas are `<name>.schema.json`,
included as `"@schema(name)"`.

<!-- snippet: examples/22-code-pipelines/maitento/code-pipelines/tested-change/pipeline-definition.json -->
```json title="code-pipelines/tested-change/pipeline-definition.json"
{
  "name": "tested-change",
  "durationAutoTermination": "00:45:00",
  "maxFixIterations": 2,
  "promptInputs": [
    { "name": "request", "description": "The change to make, in plain words", "isRequired": true }
  ],
  "agents": [
    { "name": "developer", "defaultEngine": "DeepSeek", "role": "Fullstack" },
    { "name": "tester", "defaultEngine": "DeepSeek", "role": "Reviewer" }
  ],
  "phases": [
    {
      "name": "implement",
      "steps": [
        {
          "name": "implement",
          "agentName": "developer",
          "prompt": "@prompt(implement)",
          "isCommitable": true
        }
      ]
    },
    {
      "name": "test",
      "dependsOn": ["implement"],
      "postHook": "TestGate",
      "steps": [
        {
          "name": "run-tests",
          "agentName": "tester",
          "prompt": "@prompt(run-tests)",
          "isNewSession": true,
          "outputVariableName": "testReport"
        }
      ]
    }
  ]
}
```

<!-- snippet: examples/22-code-pipelines/maitento/code-pipelines/tested-change/prompts/implement.md -->
```md title="code-pipelines/tested-change/prompts/implement.md"
Make this change to the repository:

%%input:request%%

Keep the change small and focused.
```

In a step's prompt, `%%input:request%%` is the run input `request`, and `%%testReport%%` is the variable an earlier
step kept with `"outputVariableName": "testReport"`.

The fields you'll use most:

| Where | Field | What it does |
|---|---|---|
| pipeline | `promptInputs` | the run's inputs: `{ name, description, isRequired }` |
| pipeline | `durationAutoTermination` | a hard time limit, `"hh:mm:ss"` |
| pipeline | `maxFixIterations` | how many times a hook may loop (3 by default, 5 at most) |
| pipeline | `allowWebTools` | gives the coding agents the web tools |
| agent | `name`, `defaultEngine`, `role`, `defaultModel` | who does the work, with which coding tool and model |
| phase | `name`, `dependsOn`, `steps`, `preHook`, `postHook`, `onFailHook` | a group of steps, and the hooks around it |
| step | `name`, `agentName`, `prompt` | one prompt to one agent |
| step | `isCommitable` | commit and push the step's work when it succeeds |
| step | `isNewSession` | start the agent afresh instead of continuing its conversation |
| step | `outputVariableName` | keep the reply in a variable for later prompts and hooks |
| step | `isStructuredOutput`, `outputJsonSchema` | return JSON matching a schema |

| `defaultEngine` | Coding tool | Model key it uses |
|---|---|---|
| `Claude` | Claude Code | Anthropic |
| `Codex` | Codex CLI | OpenAI |
| `Gemini` | Gemini CLI | Gemini |
| `Qwen` | Qwen Code | Qwen |
| `DeepSeek` | Codex CLI, pointed at DeepSeek | DeepSeek |
| `Glm` | Codex CLI, pointed at GLM | GLM |

Agent `role`s: `Architect`, `Consolidator`, `Reviewer`, `Fullstack`, `Frontend`, `Backend`.

## Hooks

Hooks live in `code-pipeline-hooks/<pipeline>/*.mtc`, a folder named after the pipeline. Every function there is a
hook: it takes `(string processId, string methodName)` and returns text, and a phase or step names it (`"postHook":
"TestGate"`). There's no `main`: Maitento writes it, so one of your own fails the deploy.

A phase's **post hook** runs when the phase succeeds, and its return value decides what happens next:

| It returns | The pipeline |
|---|---|
| `{"decision": "done"}` | carries on with its phases and finishes |
| `{"decision": "loop", "loop": {"fixPhases": [...]}}` | adds the fix phases after this one, up to `maxFixIterations` times |
| `{"decision": "inject", "injectPhases": [...]}` | adds the phases once, after this one |

<!-- snippet: examples/22-code-pipelines/maitento/code-pipeline-hooks/tested-change/tested-change.mtc -->
```c title="code-pipeline-hooks/tested-change/tested-change.mtc"
// Hooks for the tested-change pipeline. Every function here takes (processId, methodName) and returns text.

// The test phase's post hook: it reads the tester's report and decides what the pipeline does next.
string TestGate(string processId, string methodName) {
	string report = PipelineGetVariable(processId, "testReport");

	// The tests pass: nothing more to do.
	if (StringContains(report, "EXIT CODE: 0", false)) {
		PipelineSetVariable(processId, "testsPassed", "true");
		return("{\"decision\": \"done\"}");
	}

	// They fail: loop back. The developer fixes the code in its own session, with the report in its prompt, then
	// the tests run again, with this same hook after them. maxFixIterations caps how many times.
	PipelineSetVariable(processId, "testsPassed", "false");
	PipelineLog(processId, "TestGate: the tests failed, looping back to the developer");
	string fix = "{\"name\": \"fix\", \"targetRole\": \"Fullstack\", \"prompt\": \"@promptJson(tested-change/fix)\", \"isCommitable\": true}";
	string retest = "{\"name\": \"run-tests\", \"targetRole\": \"Reviewer\", \"prompt\": \"@promptJson(tested-change/run-tests)\", \"isNewSession\": true, \"outputVariableName\": \"testReport\"}";
	string fixPhase = "{\"name\": \"fix\", \"steps\": [" + fix + "]}";
	string retestPhase = "{\"name\": \"retest\", \"dependsOn\": [\"fix\"], \"postHook\": \"TestGate\", \"steps\": [" + retest + "]}";
	return("{\"decision\": \"loop\", \"loop\": {\"blockingIssueCount\": 1, \"fixPhases\": [" + fixPhase + ", " + retestPhase + "]}}");
}
```

- **Steps a hook adds name a `targetRole`, not an agent.** An `agentName` in them is ignored.
- **`@promptJson(pipeline/name)`** puts a pipeline prompt into the hook's text, escaped to sit inside a JSON string.
- **A hook can't fail a run.** Anything but `loop` or `inject`, including a hook that errors or runs past
  `hookDurationLimit` (30 seconds by default), counts as `done`, and a loop that reaches `maxFixIterations` stops
  looping and the run finishes anyway. To know whether the work passed, set a variable (`testsPassed` above) and
  check it before you open a pull request.
- An `onFailHook` that returns `{"decision": "continue"}` skips what failed; a step's may return `retry`.

## Running one

A run names the repositories to work on, with credentials that can push. Keep the start request in a file that never
goes into source control, and pass it with `-f`:

```json title="start-request.json"
{
  "inputs": [{ "name": "request", "value": "Add a --version flag to the CLI" }],
  "repos": [
    {
      "type": "http",
      "name": "app",
      "url": "https://github.com/acme/app.git",
      "branchSource": "main",
      "branchWork": "maitento/add-version-flag",
      "credentials": "<user>:<token>"
    }
  ]
}
```

```bash
mt code-pipeline-run tested-change -f start-request.json
mt code-pipeline-diff <run id>
```

From an SDK: `mt.pipelines.run(name, { inputs, repos })`, then `mt.pipelineRuns.rawDiff(run.id)` (TypeScript).

- Maitento creates `branchWork` from `branchSource`, and **every committable step that succeeds commits and pushes**
  to it straight away. Delete the branch before you try again.
- `"isReadOnly": true` on a repository clones it for reading only: never committed, pushed or diffed.
- A pipeline with a committable step needs a repository; one without can run with an empty `repos`.
- Use a token that can only reach the repositories you list (a GitHub fine-grained token, a GitLab project token).
- A step can ask a question: the run waits in `HumanInteractionRequired` until you answer it
  (`mt code-pipeline-answer`, `pipelineRuns.answer`).
- Engines use the tenant's model keys for their provider, or the credentials passed with the run.

Example: `examples/22-code-pipelines/` (add-feature, then tested-change with a test loop). Tutorial:
`docs/tutorials/22-code-pipelines.md`.
