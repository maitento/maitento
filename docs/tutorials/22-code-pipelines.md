---
title: 22. Code pipelines
description: Have AI coding agents change your git repository, check their work with the tests, and push a branch.
sidebar:
  order: 22
---

# 22. Code pipelines

Point a coding agent at a git repository and ask for a change. Maitento clones the repository into a sandbox of its
own, runs the coding agent, commits its work and pushes a branch you can open a pull request from. Then you'll make
the pipeline check the work: after the change, a second agent runs the tests, and a small hook decides what happens
next. If the tests fail, the work goes back to the developer with the failure, until they pass.

> **You'll learn**
>
> - code pipelines: AI coding agents (Claude Code, Codex and others) on your git repository
> - engines, agents, phases and steps, and how a pipeline's work reaches your repository
> - hooks: code that runs after a phase and decides what the pipeline does next
> - a dynamic flow: a loop the hook adds while the pipeline runs, with a limit
>
> **New concepts:** [code pipelines](../concepts/code-pipelines.md) ·
> **Builds on:** [16. Apps](16-apps.md) (hooks are written in the same language) and
> [21. Sandboxes](21-sandboxes.md) ·
> **Time:** about 30 minutes, most of it waiting: each step is a coding session of a minute or more ·
> **Cost:** a few cents per run on DeepSeek ·
> **Needs:** a git repository you can push to over `https`, and a token for it

## 1. A repository to work on

Push the tiny Python project in [`examples/22-code-pipelines/sample-repo`](../../examples/22-code-pipelines/sample-repo/)
to a new repository of your own, on GitHub or anywhere else that serves git over `https`, with `main` as its branch.
Then make a token that can push to that repository only. On GitHub, use a fine-grained token with **Contents: Read and
write**.

Set two environment variables for the scripts: `REPO_URL` to the repository's `https` address, and
`REPO_CREDENTIALS` to `<user>:<token>` (for GitHub, `x-access-token:<token>`).

**Done when:** your repository's `main` branch has `greet.py`, `test_greet.py` and `README.md`.

## 2. The project

A **code pipeline** is a folder under `code-pipelines/`, named after the pipeline, with a `pipeline-definition.json`.
This one has one agent and one step:

<!-- snippet: examples/22-code-pipelines/maitento/code-pipelines/add-feature/pipeline-definition.json -->
```json title="maitento/code-pipelines/add-feature/pipeline-definition.json"
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

- **An agent** is a coding tool with a role. Its `defaultEngine` says which tool: `DeepSeek` is Codex CLI driven by
  DeepSeek's models, on your DeepSeek model key.
- **A phase** is a group of steps; phases run in order of their `dependsOn`.
- **A step** is one prompt to one agent. `isCommitable` means its changes are committed and pushed when it succeeds.

`"@prompt(implement)"` is replaced with `prompts/implement.md` when you deploy, and `%%input:request%%` in it is the
run input called `request`:

<!-- snippet: examples/22-code-pipelines/maitento/code-pipelines/add-feature/prompts/implement.md -->
```md title="maitento/code-pipelines/add-feature/prompts/implement.md"
Make this change to the repository:

%%input:request%%

Keep the change small and focused. Add or update a test if the project has tests.
```
<!-- /snippet -->

**Done when:** you can say which file the step's prompt comes from.

## 3. Run it

Run the scripts from `examples/22-code-pipelines/typescript`, `python` or `csharp`, as in
[tutorial 1](01-hello-agent.md#run-it):

<!-- tabs -->
<!-- snippet: examples/22-code-pipelines/typescript/pipeline.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

// The repository to work on, and credentials that can push to it, e.g. "x-access-token:<github token>".
const url = process.env.REPO_URL;
const credentials = process.env.REPO_CREDENTIALS;
if (!url || !credentials) throw new Error("Set REPO_URL and REPO_CREDENTIALS first.");

const mt = new Maitento();
await mt.deploy("../maitento");

const run = await mt.pipelines.run("add-feature", {
  inputs: { request: "Add a --shout flag that prints the greeting in capital letters, with a test for it." },
  repos: [{
    type: "http",
    name: "app",
    url,
    credentials,
    branchSource: "main",
    branchWork: "maitento/add-shout-flag",
  }],
});
console.log(`Pipeline ${run.status}. The work is on the maitento/add-shout-flag branch.\n`);

const diff = await mt.pipelineRuns.rawDiff(run.id);
console.log(diff?.diffRaw ?? "(no changes)");
```
<!-- /snippet -->
<!-- snippet: examples/22-code-pipelines/python/pipeline.py -->
```python title="Python"
import os
import sys

from maitento import Maitento

# The repository to work on, and credentials that can push to it, e.g. "x-access-token:<github token>".
url = os.environ.get("REPO_URL")
credentials = os.environ.get("REPO_CREDENTIALS")
if not url or not credentials:
    sys.exit("Set REPO_URL and REPO_CREDENTIALS first.")

mt = Maitento()
mt.deploy("../maitento")

run = mt.pipelines.run(
    "add-feature",
    inputs={"request": "Add a --shout flag that prints the greeting in capital letters, with a test for it."},
    repos=[{
        "type": "http",
        "name": "app",
        "url": url,
        "credentials": credentials,
        "branch_source": "main",
        "branch_work": "maitento/add-shout-flag",
    }],
)
print(f"Pipeline {run.status}. The work is on the maitento/add-shout-flag branch.\n")

diff = mt.pipeline_runs.raw_diff(run.id)
print(diff.diff_raw if diff else "(no changes)")
```
<!-- /snippet -->
<!-- snippet: examples/22-code-pipelines/csharp/pipeline.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Entities.CodePipelines.Process;
using Maitento.Entities.CodePipelines.WebApi;
using Maitento.Entities.Database;
using Maitento.Sdk;

// The repository to work on, and credentials that can push to it, e.g. "x-access-token:<github token>".
var url = Environment.GetEnvironmentVariable("REPO_URL");
var credentials = Environment.GetEnvironmentVariable("REPO_CREDENTIALS");
if (string.IsNullOrEmpty(url) || string.IsNullOrEmpty(credentials))
    throw new InvalidOperationException("Set REPO_URL and REPO_CREDENTIALS first.");

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

var request = "Add a --shout flag that prints the greeting in capital letters, with a test for it.";
var run = await mt.CodePipelines.RunAsync("add-feature", new CodePipelineProcessStartRequest
{
    Inputs = [new NameValuePair("request", request)],
    Repos =
    [
        new CodePipelineGitHttpRepo
        {
            Name = "app",
            Url = url,
            Credentials = credentials,
            BranchSource = "main",
            BranchWork = "maitento/add-shout-flag",
        },
    ],
});
Console.WriteLine($"Pipeline {run.Status}. The work is on the maitento/add-shout-flag branch.\n");

var diff = await mt.CodePipelineProcesses.GetDiffRawAsync(run.Id);
Console.WriteLine(diff?.DiffRaw ?? "(no changes)");
```
<!-- /snippet -->
<!-- /tabs -->

A run takes a minute or two:

```text
Pipeline Finished. The work is on the maitento/add-shout-flag branch.

diff --git a/greet.py b/greet.py
--- a/greet.py
+++ b/greet.py
@@ -2,15 +2,17 @@
 import argparse
 
 
-def greeting(name: str) -> str:
-    return f"Hello, {name}!"
+def greeting(name: str, shout: bool = False) -> str:
+    message = f"Hello, {name}!"
+    return message.upper() if shout else message
 …
+    parser.add_argument("--shout", action="store_true", help="print the greeting in capital letters")
…
diff --git a/test_greet.py b/test_greet.py
…
+def test_greeting_shout():
+    assert greeting("Ana", shout=True) == "HELLO, ANA!"
```

Maitento cloned your repository into a sandbox, created the branch `maitento/add-shout-flag` from `main`, ran the
coding agent with the prompt, committed what it changed and pushed the branch. The script then printed the run's
diff. Open your repository: the branch has the agent's commit, ready for a pull request. Maitento never opens the pull
request or merges for you.

**Done when:** your repository has a `maitento/add-shout-flag` branch with the agent's commit.

## 4. Check the work: a test phase and a hook

The developer added a test, but nothing in the pipeline checked that the tests pass. The `tested-change` pipeline adds a second agent, a tester,
in a phase of its own that runs after the developer's:

<!-- snippet: examples/22-code-pipelines/maitento/code-pipelines/tested-change/pipeline-definition.json -->
```json title="maitento/code-pipelines/tested-change/pipeline-definition.json"
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
<!-- /snippet -->

The tester runs the tests in a fresh session (`isNewSession`), changes nothing, and ends its reply with the exit code.
`outputVariableName` keeps that reply in a pipeline **variable**, `testReport`:

<!-- snippet: examples/22-code-pipelines/maitento/code-pipelines/tested-change/prompts/run-tests.md -->
```md title="maitento/code-pipelines/tested-change/prompts/run-tests.md"
Run the project's tests and report the result. Don't change any file.

From the repository root, run exactly: python3 -m pytest -q

Say which tests failed, with their error output. End your reply with one line: EXIT CODE: followed by the command's exit code.
```
<!-- /snippet -->

The test phase has a `postHook`, `TestGate`. A **hook** is a small function in
[Cogniscript](../concepts/cogniscript.md), the apps' language, in `code-pipeline-hooks/<pipeline>/`. A phase's post hook runs when
the phase has succeeded, and what it returns decides what the pipeline does next:

<!-- snippet: examples/22-code-pipelines/maitento/code-pipeline-hooks/tested-change/tested-change.mtc -->
```c title="maitento/code-pipeline-hooks/tested-change/tested-change.mtc"
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

| A post hook returns | The pipeline… |
|---|---|
| `{"decision": "done"}` | carries on with the phases it has, and finishes when they're done |
| `{"decision": "loop", "loop": {"fixPhases": [...]}}` | adds the `fixPhases`, named `fix-1`, `retest-1` and so on, after this phase; at most `maxFixIterations` times (3 unless the pipeline says, at most 5) |
| `{"decision": "inject", "injectPhases": [...]}` | adds the phases once, after this one |

- **`PipelineGetVariable` and `PipelineSetVariable`** read and write the run's variables. `%%testReport%%` in a
  prompt is the variable's value when the step starts, which is how the developer sees the failure.
- **`@promptJson(tested-change/fix)`** puts a prompt file into the hook's text when you deploy, ready to sit inside a
  JSON string.
- **Steps a hook adds name a role** (`targetRole`), not an agent: `Fullstack` is the developer, `Reviewer` the tester.
  A step without `isNewSession` carries on the agent's own session, so the developer still knows what it did.

The developer's fix prompt is the report and one rule:

<!-- snippet: examples/22-code-pipelines/maitento/code-pipelines/tested-change/prompts/fix.md -->
```md title="maitento/code-pipelines/tested-change/prompts/fix.md"
The tests failed after your change. This is the test report:

%%testReport%%

Fix the code so the tests pass. Change a test only if the change you were asked to make means the test is now wrong.
```
<!-- /snippet -->

**Done when:** you can say what `TestGate` returns when the tests pass, and when they fail.

## 5. Run the tested pipeline

`tested.ts` asks for a different change, on a branch of its own, then prints every phase that ran, what each post
hook decided, and the variables the hook set:

<!-- tabs -->
<!-- snippet: examples/22-code-pipelines/typescript/tested.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

// The repository to work on, and credentials that can push to it, e.g. "x-access-token:<github token>".
const url = process.env.REPO_URL;
const credentials = process.env.REPO_CREDENTIALS;
if (!url || !credentials) throw new Error("Set REPO_URL and REPO_CREDENTIALS first.");

// The change to make, and the branch to push it to.
const request = process.argv[2] ?? "Add a --times option that prints the greeting that many times, with a test for it.";
const branch = process.argv[3] ?? "maitento/add-times-option";

const mt = new Maitento();
await mt.deploy("../maitento");

const run = await mt.pipelines.run("tested-change", {
  inputs: { request },
  repos: [{ type: "http", name: "app", url, credentials, branchSource: "main", branchWork: branch }],
});

// Every phase that ran, including the ones the hook added, and what its post hook decided.
for (const phase of run.phases) {
  const steps = phase.steps.map((step) => `${step.agentName} ${step.stepName}${step.didCommit ? ", committed" : ""}`);
  const decision = phase.hookPostOutput ? ` -> ${JSON.parse(phase.hookPostOutput).decision}` : "";
  console.log(`${phase.phaseName}: ${phase.status} (${steps.join("; ")})${decision}`);
}
const variable = (name: string) => run.variables?.find((v) => v.name === name)?.value;
console.log(`\nTests passed: ${variable("testsPassed")}`);
console.log(`The last test report ends: ${(variable("testReport") ?? "").trim().split("\n").at(-1)}`);
console.log(`\nPipeline ${run.status}. The work is on the ${branch} branch.`);
```
<!-- /snippet -->
<!-- snippet: examples/22-code-pipelines/python/tested.py -->
```python title="Python"
import json
import os
import sys

from maitento import Maitento

# The repository to work on, and credentials that can push to it, e.g. "x-access-token:<github token>".
url = os.environ.get("REPO_URL")
credentials = os.environ.get("REPO_CREDENTIALS")
if not url or not credentials:
    sys.exit("Set REPO_URL and REPO_CREDENTIALS first.")

# The change to make, and the branch to push it to.
default_request = "Add a --times option that prints the greeting that many times, with a test for it."
request = sys.argv[1] if len(sys.argv) > 1 else default_request
branch = sys.argv[2] if len(sys.argv) > 2 else "maitento/add-times-option"

mt = Maitento()
mt.deploy("../maitento")

run = mt.pipelines.run(
    "tested-change",
    inputs={"request": request},
    repos=[{
        "type": "http",
        "name": "app",
        "url": url,
        "credentials": credentials,
        "branch_source": "main",
        "branch_work": branch,
    }],
)

# Every phase that ran, including the ones the hook added, and what its post hook decided.
for phase in run.phases:
    steps = [f"{s.agent_name} {s.step_name}{', committed' if s.did_commit else ''}" for s in phase.steps]
    decision = f" -> {json.loads(phase.hook_post_output)['decision']}" if phase.hook_post_output else ""
    print(f"{phase.phase_name}: {phase.status} ({'; '.join(steps)}){decision}")

variables = {v.name: v.value for v in run.variables or []}
print(f"\nTests passed: {variables.get('testsPassed')}")
report = (variables.get("testReport") or "").strip().splitlines()
print(f"The last test report ends: {report[-1] if report else ''}")
print(f"\nPipeline {run.status}. The work is on the {branch} branch.")
```
<!-- /snippet -->
<!-- snippet: examples/22-code-pipelines/csharp/tested.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using System.Text.Json;
using Maitento.Entities.CodePipelines.Process;
using Maitento.Entities.CodePipelines.WebApi;
using Maitento.Entities.Database;
using Maitento.Sdk;

// The repository to work on, and credentials that can push to it, e.g. "x-access-token:<github token>".
var url = Environment.GetEnvironmentVariable("REPO_URL");
var credentials = Environment.GetEnvironmentVariable("REPO_CREDENTIALS");
if (string.IsNullOrEmpty(url) || string.IsNullOrEmpty(credentials))
    throw new InvalidOperationException("Set REPO_URL and REPO_CREDENTIALS first.");

// The change to make, and the branch to push it to.
var request = args.Length > 0 ? args[0] : "Add a --times option that prints the greeting that many times, with a test for it.";
var branch = args.Length > 1 ? args[1] : "maitento/add-times-option";

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

var run = await mt.CodePipelines.RunAsync("tested-change", new CodePipelineProcessStartRequest
{
    Inputs = [new NameValuePair("request", request)],
    Repos =
    [
        new CodePipelineGitHttpRepo
        {
            Name = "app",
            Url = url,
            Credentials = credentials,
            BranchSource = "main",
            BranchWork = branch,
        },
    ],
});

// Every phase that ran, including the ones the hook added, and what its post hook decided.
foreach (var phase in run.Phases)
{
    var steps = phase.Steps.Select(step => $"{step.AgentName} {step.StepName}{(step.DidCommit ? ", committed" : "")}");
    var decision = phase.HookPostOutput is { } hook
        ? $" -> {JsonDocument.Parse(hook).RootElement.GetProperty("decision").GetString()}"
        : "";
    Console.WriteLine($"{phase.PhaseName}: {phase.Status} ({string.Join("; ", steps)}){decision}");
}

string? Variable(string name) => run.Variables?.FirstOrDefault(v => v.Name == name)?.Value;
Console.WriteLine($"\nTests passed: {Variable("testsPassed")}");
Console.WriteLine($"The last test report ends: {(Variable("testReport") ?? "").Trim().Split('\n').Last()}");
Console.WriteLine($"\nPipeline {run.Status}. The work is on the {branch} branch.");
```
<!-- /snippet -->
<!-- /tabs -->

```text
implement: Finished (developer implement, committed)
test: Finished (tester run-tests) -> done

Tests passed: true
The last test report ends: EXIT CODE: 0

Pipeline Finished. The work is on the maitento/add-times-option branch.
```

The developer made the change and committed it; the tester ran the tests in a session of its own; the hook read
the report, found `EXIT CODE: 0`, set `testsPassed` and said `done`. This run took two minutes.

**Done when:** the run ends `Finished` with `Tests passed: true`, and the `maitento/add-times-option` branch has the
developer's commit.

## 6. Break it on purpose: a change that breaks a test

Ask for a change that the existing test disagrees with, and tell the developer to leave the tests alone:

```bash
node tested.ts "Change the greeting to 'Hi, <name>!'. Don't change the tests." maitento/say-hi
```

```text
implement: Finished (developer implement, committed)
test: Finished (tester run-tests) -> loop
fix-1: Finished (developer fix, committed)
retest-1: Finished (tester run-tests) -> done

Tests passed: true
The last test report ends: EXIT CODE: 0

Pipeline Finished. The work is on the maitento/say-hi branch.
```

What happened, step by step:

1. **implement:** the developer changed the greeting and, as told, left the tests alone.
2. **test:** the tester's run failed. Its report, the `testReport` variable, ended like this:

   ```text
   E       AssertionError: assert 'Hi, Ana!' == 'Hello, Ana!'
   …
   1 failed in 0.01s

   EXIT CODE: 1
   ```

3. **The hook** didn't find `EXIT CODE: 0`, so it returned `loop`, and the pipeline added `fix-1` and `retest-1`.
4. **fix-1:** the developer, still in its own session, read the report. The change it had been asked for made the
   old test wrong, so it updated the test, and the fix was committed and pushed.
5. **retest-1:** a fresh tester ran the tests again; they passed, and the same hook said `done`.

If the tests had still been failing after `maxFixIterations` rounds (2 here), the pipeline would have stopped
looping and finished anyway, with `testsPassed` set to `false`. A hook decides what runs next, but it can't fail a
run, so check `testsPassed` before you open a pull request.

**Done when:** you see `fix-1` and `retest-1` in the list, and the `maitento/say-hi` branch has two commits.

## All the files

Every file in this tutorial's project, including the sample repository:

<!-- project: examples/22-code-pipelines -->
**On GitHub:** [`examples/22-code-pipelines`](https://github.com/maitento/maitento/tree/main/examples/22-code-pipelines) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/22-code-pipelines/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/22-code-pipelines/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/22-code-pipelines/csharp)

<details>
<summary>All the files in this project (11)</summary>

<!-- tabs: files -->
**`maitento/code-pipeline-hooks/tested-change/tested-change.mtc`**
```c title="maitento/code-pipeline-hooks/tested-change/tested-change.mtc"
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

**`maitento/code-pipelines/add-feature/pipeline-definition.json`**
```json title="maitento/code-pipelines/add-feature/pipeline-definition.json"
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

**`maitento/code-pipelines/add-feature/prompts/implement.md`**
```md title="maitento/code-pipelines/add-feature/prompts/implement.md"
Make this change to the repository:

%%input:request%%

Keep the change small and focused. Add or update a test if the project has tests.
```

**`maitento/code-pipelines/tested-change/pipeline-definition.json`**
```json title="maitento/code-pipelines/tested-change/pipeline-definition.json"
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

**`maitento/code-pipelines/tested-change/prompts/fix.md`**
```md title="maitento/code-pipelines/tested-change/prompts/fix.md"
The tests failed after your change. This is the test report:

%%testReport%%

Fix the code so the tests pass. Change a test only if the change you were asked to make means the test is now wrong.
```

**`maitento/code-pipelines/tested-change/prompts/implement.md`**
```md title="maitento/code-pipelines/tested-change/prompts/implement.md"
Make this change to the repository:

%%input:request%%

Keep the change small and focused.
```

**`maitento/code-pipelines/tested-change/prompts/run-tests.md`**
```md title="maitento/code-pipelines/tested-change/prompts/run-tests.md"
Run the project's tests and report the result. Don't change any file.

From the repository root, run exactly: python3 -m pytest -q

Say which tests failed, with their error output. End your reply with one line: EXIT CODE: followed by the command's exit code.
```

**`sample-repo/.gitignore`**
```text title="sample-repo/.gitignore"
__pycache__/
*.pyc
.pytest_cache/
```

**`sample-repo/README.md`**
````md title="sample-repo/README.md"
# greeting-cli

A tiny command-line greeter. Push this folder to a repository of your own to try the code pipeline tutorial.

```bash
python greet.py Ana      # Hello, Ana!
python -m pytest         # runs the tests
```
````

**`sample-repo/greet.py`**
```python title="sample-repo/greet.py"
"""A tiny command-line greeter, used as the starting point for the code pipeline tutorial."""
import argparse


def greeting(name: str) -> str:
    return f"Hello, {name}!"


def main() -> None:
    parser = argparse.ArgumentParser(description="Print a greeting.")
    parser.add_argument("name", help="who to greet")
    args = parser.parse_args()
    print(greeting(args.name))


if __name__ == "__main__":
    main()
```

**`sample-repo/test_greet.py`**
```python title="sample-repo/test_greet.py"
from greet import greeting


def test_greeting():
    assert greeting("Ana") == "Hello, Ana!"
```
<!-- /tabs -->

</details>

<!-- /project -->

## If it didn't work

- **The run ends `Error` while cloning, or pushing fails:** check `REPO_URL` (the `https` address, ending `.git`)
  and `REPO_CREDENTIALS` (`<user>:<token>`), and that the token can write to the repository.
- **The step fails at once with an error about model keys:** the `DeepSeek` engine uses your tenant's DeepSeek key.
  Add one ([Model keys](../concepts/models-and-keys.md)), or use another engine you have a key for.
- **The hook never runs:** the hook folder must have the pipeline's name (`code-pipeline-hooks/tested-change/`), and
  `postHook` must name a function in it exactly.
- **The loop keeps going round and the tests never pass:** look at `testReport`. If the tests can't start at all
  (a missing tool, a wrong command), no fix to the code will help: change the test step's prompt. Every fix is
  committed, so delete the branch before you try again.

## Review

**What you built:** a pipeline that changes your repository and pushes a branch, and a second one that tests the
change, sends failures back to the developer, and stops when the tests pass or the limit is reached.

**The concepts:**

- [A code pipeline](../concepts/code-pipelines.md) runs coding agents on your repositories, in phases and steps.
- **Engines** are the coding tools (Claude Code, Codex, Gemini CLI and more); each uses your key for its provider.
- **Committable steps** commit and push to the work branch as soon as they succeed.
- **Variables** carry a step's output to later prompts (`%%name%%`) and to hooks.
- **Hooks** run after a phase or a step, and a phase's post hook can add phases while the pipeline runs: `loop` to
  repeat work up to a limit, `inject` to add it once.

**Challenge:** once the tests pass, have the pipeline update the README to show the new option, in a phase the hook
adds. Hint: the `inject` decision, and a new prompt file. A solution in TypeScript, Python and C# is in
[`examples/22-code-pipelines/solution`](../../examples/22-code-pipelines/solution/):

```text
implement: Finished (developer implement, committed)
test: Finished (tester run-tests) -> inject
docs: Finished (developer update-readme, committed)

Pipeline Finished. The work is on the maitento/times-with-docs branch.
```

The solution is a pipeline of its own, `tested-change-docs`, so it doesn't replace this tutorial's.

## Where next

You've now used every part of Maitento. From here:

- [23. Support desk](23-support-desk.md) puts most of them together in one small web app;
- the [concepts](../concepts/index.md) go deeper on each idea;
- every API call is in the [API reference](../reference/index.md), with curl and SDK examples, and you can try any of
  them in the [API playground](https://docs.maitento.com/playground/).
