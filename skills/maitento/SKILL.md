---
name: maitento
description: Build, debug and deploy AI apps on Maitento, the AI operating system. Use when writing or fixing a Maitento project (a folder of .mtr files that define agents, interactions, tools, capsules and looms), Cogniscript apps and code pipeline hooks (.mtc), or code pipelines (pipeline-definition.json); when calling Maitento from the TypeScript, Python or C# SDK or the mt command line; when deploying with mt or an SDK, including from CI; or when a build, a run or an api:* error code needs explaining.
license: Apache-2.0
compatibility: Reads offline from the files in this folder. mt build, mt deploy and the SDKs need a Maitento API key and network access. The offline checker in scripts/ needs Node.js 18 or later.
metadata:
  publisher: Maitento
  docs: https://docs.maitento.com
  repository: https://github.com/maitento/maitento
---

# Building apps with Maitento

Maitento runs AI agents for you. You describe *what* should happen in small text files (agents, the interactions
that put them to work, the tools they may call, apps that orchestrate them), **deploy** the folder, then start
**runs** from your code, a schedule or the `mt` command line. Maitento calls the models, runs the tools, keeps the
conversation and memory, and tells you when a run is done.

`.mtr` and Cogniscript are Maitento's own formats, so don't write them from memory of anything else: follow the
rules here and check every file before you deploy it.

## Where the detail is

The `references/` files next to this one cover each thing you write. They point into Maitento's public repository,
`github.com/maitento/maitento`, with paths from its root such as `docs/concepts/tools.md` or
`examples/08-first-tool/`. To read one:

- **From a local copy** when you have one. This skill sits at `skills/maitento/` in that repository, so its root is
  two folders up from this file. A clone, or a folder that holds `docs/` and `examples/`, works the same way.
- **From GitHub:** `https://raw.githubusercontent.com/maitento/maitento/main/<path>`.
- **From the docs site**, for a page under `docs/`: drop `docs/` and keep the rest, so `docs/concepts/tools.md` is
  `https://docs.maitento.com/concepts/tools.md`. A folder's `index.md` is the folder's name plus `.md`.

The examples under `examples/` are complete, tested projects. When you build something, start from the example
closest to it rather than from a blank file.

## How Maitento fits together

- **Tenant:** your organisation. People sign in to the portal (`https://app.maitento.com`); code signs in with an
  **API key**, the text `<user id>:<secret>`.
- **Namespace:** a named folder for one project's definitions. Names only have to be unique inside a namespace. The
  first deploy to a namespace creates it.
- **Definition:** something you describe in a file and deploy: an agent, an interaction, a tool, an app, a capsule,
  a code pipeline. Every deploy that changes one adds a new **version**; new runs use the newest.
- **Run** (also called a **process**): one execution of a definition. It has an id, moves through statuses such as
  `New`, `Running`, `Finished`, `Error` and `Killed`, and ends with an output or `failureDetails`.
- **Models run on your own provider account.** A tenant adds **model keys** (DeepSeek, OpenAI, Anthropic, Gemini, …)
  once, and every run uses them. A run that has no key for its agent's model fails with
  `api:model-keys:none-for-provider`.

| You want to… | Write | Read |
|---|---|---|
| give a model a role and standing instructions | an **agent** | [agents](references/agents.md) |
| put agents to work on a task, with inputs and an answer | an **interaction** (one-shot, round-robin or managed) | [interactions](references/interactions.md) |
| let an agent call an HTTP API, yours included | a **connector** and a **tool** | [tools](references/tools.md) |
| write logic around agents: loops, branches, many runs at once | an **app**, in Cogniscript | [apps and Cogniscript](references/apps-and-cogniscript.md) |
| run coding agents on a git repository | a **code pipeline** | [code pipelines](references/code-pipelines.md) |
| answer from documents, give agents files, remember people | knowledge bases, file systems, looms | [knowledge and memory](references/knowledge-and-memory.md) |
| call Maitento from your code | the TypeScript, Python or C# SDK | [SDKs](references/sdks.md) |
| work from a terminal or a script | the `mt` command line | [CLI](references/cli.md) |
| ship it from CI | `mt build`, `mt deploy` and secrets | [deploy and CI](references/deploy-and-ci.md) |
| find out why something failed | error codes and symptoms | [troubleshooting](references/troubleshooting.md) |

## A project

A project is a folder, usually called `maitento/` inside the app it belongs to. Each kind of definition has its own
sub-folder, and **the file name is the definition's name**: `agents/greeter.mtr` defines the agent `greeter`.

```text
maitento/
├── agents/                        agents (.mtr)
├── interactions/
│   ├── one-shot/                  one agent, one task, one answer
│   ├── round-robin/               agents (and a person) taking turns
│   └── managed/                   a manager handing work to a team
├── connectors/open-api/           HTTP endpoints, described once (.mtr)
├── external-operations/open-api/  tools: what an agent sees and calls (.mtr)
├── apps/<name>/                   an app's Cogniscript (*.mtc) and optional settings (.mtr)
├── capsules/                      short-lived Linux sandboxes (.mtr)
├── looms/                         named long-term memories (.mtr)
├── code-pipelines/<name>/         pipeline-definition.json, prompts/, *.schema.json
├── code-pipeline-hooks/<name>/    a pipeline's hooks (*.mtc)
├── prompts/                       long text, included with @prompt("name")
└── json/                          JSON Schemas, included with @json("name")
```

Sub-folders inside these are fine, and anything else (a README) is ignored. `mt init <folder>` creates the smallest
project that runs, and `mt init <folder> --example 08` copies a tutorial's example.

A first agent and the interaction that runs it, from `examples/01-hello-agent/maitento/`:

<!-- snippet: examples/01-hello-agent/maitento/agents/greeter.mtr -->
```hcl title="agents/greeter.mtr"
// The model this agent runs on. See the names you can use with `mt aimodel-list`.
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a friendly assistant. Keep every answer to one or two sentences."
summary = "A friendly assistant"
```

<!-- snippet: examples/01-hello-agent/maitento/interactions/one-shot/hello.mtr -->
```hcl title="interactions/one-shot/hello.mtr"
// A one-shot interaction: one agent, one task, one answer.
agent = {
  name = "Greeter"
  agent = @ref("greeter")
}
task = "Hello, how are you?"
```

The `.mtr` rules, and every other file a project can hold, are in [project files](references/project-files.md).

## The loop: check, validate, deploy, run

1. **Check the files offline**, as often as you like. It needs only Node, no key and no network:

   ```bash
   node scripts/check-mtr.cjs ./maitento
   ```

   `scripts/` is in this skill's folder. It finds unknown and missing properties, values of the wrong kind, missing
   spaces around `=`, commas inside blocks and `@prompt` / `@json` files that don't exist. It checks `.mtr` files
   only, not Cogniscript, and it can't know what's already deployed, so still validate before you deploy.
2. **Validate** with Maitento: it compiles every file (Cogniscript and pipeline definitions included) and checks
   every `@ref`, then saves nothing.

   ```bash
   mt build ./maitento
   ```

3. **Deploy**: the same checks, then everything is saved as one change. If any file has an error, nothing changes.

   ```bash
   mt deploy ./maitento
   ```

4. **Run it and read the result:**

   ```bash
   mt interaction-run hello
   ```

   Inputs are options: `mt interaction-run haiku --input-topic "autumn rain"`. A run that fails says why in its
   `failureDetails`, and `mt` exits 1. Read the reason before you change anything.

From code, the SDKs do the same: `await mt.validate("./maitento")`, `await mt.deploy("./maitento")` and
`await mt.interactions.run("hello")` in TypeScript (see [SDKs](references/sdks.md)).

Both `mt` and the SDKs read these environment variables:

| Variable | Holds | Default |
|---|---|---|
| `MAITENTO_API_KEY` | the API key, `<user id>:<secret>` | none |
| `MAITENTO_NAMESPACE` | the namespace to deploy to and run in | none |
| `MAITENTO_BASE_URL` | the API | `https://api.maitento.com` |

`mt doctor` checks the setup: the API, the key, the namespace, and that there's a model key for every model the
project's agents use.

## What a deploy doesn't create

Things that hold data rather than describe behaviour are created through the API, an SDK or `mt`, never by a deploy:

- **secrets** (`mt secret-create`): create them **before** you deploy a tool or capsule that names one, or the
  deploy fails;
- **virtual file systems** (`mt vfs-create`) and **knowledge bases** (`mt partition-create`);
- **webhooks** (`mt webhook-set`) and **automations** (schedules and triggers);
- **API keys** and **model keys**.

A deploy also **never deletes**. Removing a file doesn't remove the definition: delete it with its own delete command
(`mt agent-delete`, `mt interaction-delete` and the like), an SDK or the portal.

## Choosing what to build

| The job | Build |
|---|---|
| one question, one task or one extraction, one answer | a **one-shot** interaction |
| JSON your code reads, not prose | add `schema.solution = @json("…")` to the interaction |
| a chat with a person | a **round-robin** interaction with `human = { first = true }` |
| send each question to the right specialist | a **router** agent (`routedSubAgents`) in an interaction |
| work that splits into parts a lead hands out | a **managed** interaction |
| an agent that fans out to other interactions and combines the answers | **sub-interactions** (`swarm` + `allowSwarm`) |
| fixed logic around agents: loops, retries, many runs at once | an **app** (Cogniscript) |
| run commands or scripts in a throwaway Linux machine | a **capsule** |
| coding agents that change a git repository and push a branch | a **code pipeline** |
| something on a schedule, or when another run ends | an **automation** that starts an app or interaction |

Most things start as a one-shot interaction. Prefer an app over a long prompt when the steps must happen the same way
every time, and prefer a tool binding over a prompt instruction when a value must never come from the model.

## Rules that catch people out

1. **Spaces around `=`:** `summary = "x"`, never `summary="x"`.
2. **A dotted name is one name:** `inputs.prompts = [ … ]`, never `inputs = { prompts = … }`.
3. **Blocks `{ }` have no commas; lists `[ ]` do.** A list can't be empty: leave the property out.
4. **Text is literal.** `\n` stays a backslash and an `n`. Put anything longer than a sentence in `prompts/*.md` and
   use `@prompt("name")`.
5. **Inputs are filled in only in an interaction's `task` and the prompt files it includes**, as `%%name%%`. Never in
   an agent's `prompt`.
6. **Input names are case-sensitive** in a run, but `mt` takes them in lower case: `--input-temperatureunit` for
   `temperatureUnit`.
7. **An agent version is pinned when the interaction is deployed.** Deploy the whole folder after changing an agent.
8. **A connector with no `schema.request` sends no body**, even for a `POST`.
9. **Fix every value the model has no reason to choose** with a tool binding: ids, units and flags the model never
   sees can't be wrong.
10. **Cogniscript isn't C:** every value is text, `"10" + "20"` is `30`, `7 / 2` is `3.5`, and a system call takes
    every argument even when you pass `""` or `"[]"`.
11. **Knowledge bases need an OpenAI model key** for embeddings (DeepSeek doesn't provide them), unless the knowledge
    base is set to Gemini or Qwen.
12. **Never put a key in a file.** Tools send [secrets](references/tools.md#secrets); CI reads `MAITENTO_API_KEY`
    from its secret store.

## Working on a Maitento project

- **Read before you write.** List what's in the project, and read the example closest to the job.
- **Change one thing, then check it.** Run the offline checker after every edit, `mt build` before a deploy, and run
  the definition after a deploy. A green build doesn't prove the agent does the job: read the run's output.
- **When a run fails, read its `failureDetails` first.** An `api:*` code in brackets at the end names the cause; look
  it up in [troubleshooting](references/troubleshooting.md).
- **Keep the model choices the project already makes.** `mt aimodel-list` lists the names `model = @ref("…")` takes,
  and a model needs a key for its provider in the tenant.
- **Tell the user before anything that costs money**: deploying is free, but every run calls models on their account.

## Reference files

| File | Read it when |
|---|---|
| [project-files.md](references/project-files.md) | writing any `.mtr` file, a prompt or JSON file, or using `@ref` / `@prompt` / `@json` |
| [agents.md](references/agents.md) | writing an agent, a router, or giving an agent tools or the web |
| [interactions.md](references/interactions.md) | writing an interaction: inputs, structured output, chats, teams, approvals, statuses |
| [tools.md](references/tools.md) | letting an agent call an API: connectors, tools, bindings, secrets, approvals |
| [apps-and-cogniscript.md](references/apps-and-cogniscript.md) | writing an app or a pipeline hook in Cogniscript |
| [code-pipelines.md](references/code-pipelines.md) | writing `pipeline-definition.json`, its prompts and hooks, and running one |
| [knowledge-and-memory.md](references/knowledge-and-memory.md) | knowledge bases, file systems, memory (looms), web tools, capsules |
| [sdks.md](references/sdks.md) | calling Maitento from TypeScript, Python or C# |
| [cli.md](references/cli.md) | using `mt` in a terminal or a script |
| [deploy-and-ci.md](references/deploy-and-ci.md) | validating and deploying, versions, setting up a namespace, CI |
| [troubleshooting.md](references/troubleshooting.md) | a build, deploy or run failed, or an `api:*` code came back |
