---
title: Code pipelines
description: Code pipelines run AI coding agents on your git repositories, in steps and phases, and push the result.
sidebar:
  order: 15
---

# Code pipelines

A **code pipeline** is a recipe for AI **coding** agents (Claude Code, Codex, Gemini CLI and others) to work on your
git repositories. Maitento clones your repos into a sandbox, runs each step with the coding tool you chose, commits
the work and pushes a branch.

A pipeline is made of:

- **agents**, each driven by an **engine** (a coding tool) and optionally a model;
- **phases**, which run in order or in parallel depending on what they wait for;
- **steps**, each one prompt to one agent. A step can commit, return structured JSON for later steps, or stop and
  ask a person a question;
- **hooks**, small functions that run before or after a phase or a step. A phase's post hook decides what the
  pipeline does next.

See it in [tutorial 22, Code pipelines](../tutorials/22-code-pipelines.md): one agent changes a repository and pushes
a branch, then a tester and a hook send failing work back to the developer until the tests pass.

## Define one

A pipeline is a folder under `code-pipelines/` holding a `pipeline-definition.json`. The folder's name must match
the `name` inside it.

<!-- snippet: examples/22-code-pipelines/maitento/code-pipelines/add-feature/pipeline-definition.json -->
```json title="code-pipelines/add-feature/pipeline-definition.json"
{
  "name": "add-feature",
  "durationAutoTermination": "00:30:00",
  "promptInputs": [
    { "name": "request", "description": "The change to make, in plain words", "isRequired": true }
  ],
  "agents": [
    { "name": "developer", "defaultEngine": "DeepSeek", "role": "Fullstack" }
  ],
  "phases": [
    {
      "name": "development",
      "steps": [
        {
          "name": "implement",
          "agentName": "developer",
          "prompt": "@prompt(implement)",
          "isCommitable": true
        }
      ]
    }
  ]
}
```
<!-- /snippet -->

<!-- snippet: examples/22-code-pipelines/maitento/code-pipelines/add-feature/prompts/implement.md -->
```md title="code-pipelines/add-feature/prompts/implement.md"
Make this change to the repository:

%%input:request%%

Keep the change small and focused. Add or update a test if the project has tests.
```
<!-- /snippet -->

- `"@prompt(implement)"` is replaced with `prompts/implement.md` when you deploy.
- `"@schema(name)"` is replaced with `name.schema.json` the same way.
- In step prompts, `%%input:request%%` is the run input called `request`, and `%%name%%` is a variable an earlier
  step produced.

## Engines

| `defaultEngine` | Coding tool | Model key it uses |
|---|---|---|
| `Claude` | Claude Code | Anthropic |
| `Codex` | Codex CLI | OpenAI |
| `Gemini` | Gemini CLI | Gemini |
| `Qwen` | Qwen Code | Qwen |
| `DeepSeek` | Codex CLI, pointed at DeepSeek | DeepSeek |
| `Glm` | Codex CLI, pointed at GLM (Z.ai) | GLM, on Z.ai's GLM Coding Plan |

Engines use your tenant's [model keys](models-and-keys.md), or credentials you pass with the run.

## Run one

A run names the **repositories** to work on, with credentials that can push:

```json
{
  "inputs": [{ "name": "request", "value": "Add a --version flag to the CLI" }],
  "repos": [
    {
      "type": "http",
      "name": "app",
      "url": "https://github.com/acme/app.git",
      "branchSource": "main",
      "branchWork": "maitento/add-version-flag",
      "credentials": "x-access-token:<token>"
    }
  ]
}
```

<!-- tabs -->
```ts
const run = await mt.pipelines.run("add-feature", { inputs: { request: "Add a --version flag" }, repos: [app] });
console.log((await mt.pipelineRuns.rawDiff(run.id))?.diffRaw);
```
```python
run = mt.pipelines.run("add-feature", inputs={"request": "Add a --version flag"}, repos=[app])
diff = mt.pipeline_runs.raw_diff(run.id)
print(diff.diff_raw if diff else "(no changes)")
```
```csharp
var run = await mt.CodePipelines.RunAsync("add-feature", new CodePipelineProcessStartRequest
{
    Inputs = [new NameValuePair("request", "Add a --version flag")],
    Repos = [app],
});
Console.WriteLine((await mt.CodePipelineProcesses.GetDiffRawAsync(run.Id))?.DiffRaw);
```
```bash
mt code-pipeline-run add-feature -f start-request.json
mt code-pipeline-diff <run id>
```
<!-- /tabs -->

Maitento clones each repository into the run's sandbox and creates `branchWork` from `branchSource`. **Every
committable step that succeeds commits its work and pushes it** to `branchWork` straight away, so the branch grows as
the run goes. When the run finishes, the work is on that branch, ready for a pull request: Maitento never opens one,
or merges, for you.

To give the agents code to read without letting a run change it, set `isReadOnly` to `true` on that repository. It is
cloned like the others, but Maitento never commits, pushes or diffs it. Leave `isReadOnly` at its default, `false`, for
the repositories the run should change.

A pipeline with no committable step can run with an empty `repos`, in an empty workspace. One with a committable step
needs a repository, or the start is refused: `At least one repo is required because step 'implement' is commitable`.

## Hooks: what happens next

A **hook** is a small function in [Cogniscript](cogniscript.md), the language apps are written in. A pipeline's hooks live in
`code-pipeline-hooks/<pipeline>/`, in a folder named after the pipeline, and a phase names one as its `postHook`. The
post hook runs when the phase has succeeded, and what it returns decides what the pipeline does next:

| The post hook returns | The pipeline… |
|---|---|
| `{"decision": "done"}` | carries on with the phases it has, and finishes when they're done |
| `{"decision": "loop", "loop": {"fixPhases": [...]}}` | adds the `fixPhases` after this phase (named `fix-1`, `retest-1` and so on), at most `maxFixIterations` times: 3 unless the pipeline says otherwise, and never more than 5 |
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
<!-- /snippet -->

- **Hooks read and write the run's variables**, with `PipelineGetVariable` and `PipelineSetVariable`. A step's
  `outputVariableName` keeps its reply in a variable, and `%%name%%` in a later prompt is that variable's value when
  the step starts. That is how the developer's fix prompt gets the test report.
- **`@promptJson(tested-change/fix)`** puts a prompt file into the hook's text when you deploy, ready to sit inside a
  JSON string.
- **Steps a hook adds name a role, not an agent:** each needs a `targetRole` (`Fullstack`, `Reviewer` and so on), and
  the pipeline gives it to its agent with that role. An `agentName` in a hook's steps is ignored.
- **A hook can't fail a run.** It decides what runs next and nothing else: anything other than `loop` or `inject`,
  including a hook that errors, counts as `done`. A loop that reaches `maxFixIterations` stops looping, and the run
  finishes anyway. To know whether the work passed, have the hook set a variable, as `testsPassed` above, and check
  it before you open a pull request.
- **Other hooks:** a phase or a step can also have a `preHook`, which runs before it, and an `onFailHook`, which runs
  when it fails. An `onFailHook` that returns `{"decision": "continue"}` skips what failed and goes on, and a step's
  can return `retry`; anything else lets the failure stand. A step can have a `postHook` of its own too.

See it in [tutorial 22](../tutorials/22-code-pipelines.md#4-check-the-work-a-test-phase-and-a-hook), and
[break it on purpose](../tutorials/22-code-pipelines.md#6-break-it-on-purpose-a-change-that-breaks-a-test) to watch
the loop.

## Good to know

- **Use a token that can only reach the repositories you list.** GitHub fine-grained tokens and GitLab project tokens
  work well.
- **Steps can ask you something.** The run waits in `HumanInteractionRequired` until you `answer` it.
- **Coding agents can use your [tools](tools.md)**, and the [web tools](web-tools.md) when the pipeline sets
  `allowWebTools`.
