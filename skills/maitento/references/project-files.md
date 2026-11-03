# Project files

Every kind of file a project can hold, and how to write `.mtr`. The full list of every property, generated from
Maitento's code, is `docs/reference/project-files/index.md` and the per-kind pages beside it; the same description
is machine-readable in `sdks/mtr-schema.json`.

## The kinds

| Folder | A file there defines | Every property |
|---|---|---|
| `agents/` | an agent: a model, standing instructions, a one-line summary, the tools it may use | `docs/reference/project-files/agents.md` |
| `interactions/one-shot/` | one agent, one task, one answer | `docs/reference/project-files/interactions-one-shot.md` |
| `interactions/round-robin/` | agents, and optionally a person, taking turns in one conversation | `docs/reference/project-files/interactions-round-robin.md` |
| `interactions/managed/` | a manager agent handing pieces of work to named team members | `docs/reference/project-files/interactions-managed.md` |
| `connectors/open-api/` | one HTTP endpoint, described once | `docs/reference/project-files/connectors.md` |
| `external-operations/open-api/` | a tool: what an agent sees and calls | `docs/reference/project-files/tools.md` |
| `capsules/` | the recipe for a short-lived Linux sandbox | `docs/reference/project-files/capsules.md` |
| `looms/` | a named long-term memory several interactions share | `docs/reference/project-files/looms.md` |
| `apps/<name>/` | an app's settings: the optional `.mtr` beside its Cogniscript | `docs/reference/project-files/apps.md` |

Tools are known as external operations (extops) in Maitento, which is why their folder is
`external-operations/open-api/`.

**Names.** A definition's name is its file name without `.mtr` (an app's is its folder's name): letters, digits,
`_`, `-` and `.` (but not `..`), at most 128 characters. Two files of one kind can't share a name, even in different
sub-folders or with different capitals.

## Writing `.mtr`

One `name = value` per line. Comments start with `//`.

| Write | For | Example |
|---|---|---|
| `"text"` | text, taken exactly as written; it may run over several lines | `summary = "A friendly assistant"` |
| a number, `true`, `false` | numbers and switches, **without** quotes | `allowWebSearch = true` |
| `{ name = value … }` | a block of properties, **no commas** between them | `agent = { name = "Greeter" agent = @ref("greeter") }` |
| `[ value, value ]` | a list, **with** commas; never empty | `packages = ["git", "curl"]` |
| `@ref("name")` | another definition in the namespace you deploy to, declared in this project or already deployed | `model = @ref("deepseek.deepseek-v4-flash")` |
| `@ref("name", "namespace")` | a definition in another namespace | `@ref("greeter", "shared")` |
| `@prompt("name")` | the text of `prompts/<name>.md`, as a text property's value | `task = @prompt("haiku-task")` |
| `@json("name")` | the text of `json/<name>.json`, usually a JSON Schema | `schema.solution = @json("recipe")` |

**Maps** take one line per entry: the property, a colon and the key, then the value:

```hcl
bindings.query:units = "metric"
```

**Inputs in text.** In an interaction's `task`, and in the prompt files it includes, `%%name%%` is replaced by the
run's input `name`. `{{#if name}}…{{/if}}` keeps its text only when the input has a value, and
`{{#unless name}}…{{/unless}}` only when it has none. Every block must be closed. Inputs are **not** filled in
anywhere else, an agent's `prompt` included.

A small project, from `examples/02-prompts-and-inputs/maitento/`:

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

<!-- snippet: examples/02-prompts-and-inputs/maitento/prompts/haiku-task.md -->
```md title="prompts/haiku-task.md"
Write a haiku about %%topic%%.
{{#if mood}}
The mood of the haiku should be %%mood%%.
{{/if}}
```

## The rules, with the wrong and right way

| Rule | Wrong | Right |
|---|---|---|
| spaces around `=` | `summary="A friendly assistant"` | `summary = "A friendly assistant"` |
| a dotted name is one name | `inputs = { prompts = [ { name = "topic" } ] }` | `inputs.prompts = [ { name = "topic" } ]` |
| no commas in a block | `agent = { name = "Greeter", agent = @ref("greeter") }` | `agent = { name = "Greeter" agent = @ref("greeter") }` |
| no empty lists | `functions = []` | leave the property out |
| no quotes on numbers and switches; always on text | `allowWebSearch = "true"` | `allowWebSearch = true` |
| each property once per file, and once per block | `summary = "A"` then `summary = "B"` | `summary = "B"` |
| `@prompt` / `@json` can't be list items | `prompts.system = [ @prompt("house-style") ]` | `prompts.system = [ "Write in British English." ]` |
| a file needs at least one line | an empty file | `// Settings for this app: none yet.` |

Without spaces around `=`, the build fails with `No Set node determined (<file>:<line>)`.

## The other files

| File | Where | What it is |
|---|---|---|
| prompt | `prompts/<name>.md`, any sub-folder | text for any text property, included with `@prompt("name")`. Found by name alone, so keep names unique |
| JSON | `json/<name>.json`, any sub-folder | usually a JSON Schema, included with `@json("name")`. Found by name alone |
| app code | `apps/<app>/*.mtc` | the app's Cogniscript: it starts at `main`, whose parameters are the app's inputs. See [apps and Cogniscript](apps-and-cogniscript.md) |
| code pipeline | `code-pipelines/<pipeline>/pipeline-definition.json` | its `name` must be the folder's name. See [code pipelines](code-pipelines.md) |
| pipeline prompt | `code-pipelines/<pipeline>/prompts/<name>.md` | included in the definition as `"@prompt(name)"` (in quotes, no inner quotes) |
| pipeline schema | `code-pipelines/<pipeline>/<name>.schema.json` | included in the definition as `"@schema(name)"` |
| pipeline hooks | `code-pipeline-hooks/<pipeline>/*.mtc` | Cogniscript functions, each taking `(string processId, string methodName)`. No `main`: Maitento writes it |

Includes in Cogniscript (apps and hooks): `@prompt("name")` and `@json("name")` are replaced by the file's text when
the code is compiled, so they go where a value goes: `string task = @prompt("name");`. In hooks,
`@promptJson(pipeline/name)` and `@schemaJson(pipeline/name)` put a pipeline's prompt or schema inside a JSON string.
A missing file fails the build.

## Checking files

`node scripts/check-mtr.cjs <project folder>` (in this skill's folder) checks every `.mtr` file offline, the way the
VS Code extension does. `mt build <project folder>` then compiles everything with Maitento and checks every `@ref`.
The VS Code extension (`editors/vscode/`) completes and checks `.mtr` files as you type.
