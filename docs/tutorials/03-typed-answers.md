---
title: 3. Typed answers
description: Get JSON back that matches a schema, and use it directly in your code.
sidebar:
  order: 3
---

# 3. Typed answers

Turn a messy recipe into clean JSON your code can use straight away. When a person reads the answer, prose is fine.
When your code reads it, prose means parsing sentences, and that breaks. A **schema** makes the interaction answer in
a shape you choose.

> **You'll learn**
>
> - how to describe the shape of an answer with a JSON Schema
> - how to make an interaction answer in that shape
> - how to read the answer into a typed value in TypeScript, Python and C#
> - why a field that may be missing should allow `null`
>
> **New concepts:** [structured output](../concepts/structured-output.md)
>
> **Builds on:** [2. Prompts and inputs](02-prompts-and-inputs.md)
>
> **Time:** ~15 min · **Cost:** under $0.01 on DeepSeek · **Needs:** nothing beyond Get started

## 1. Write the extractor agent

The agent's job is to copy facts out of text, not to be creative:

<!-- snippet: examples/03-typed-answers/maitento/agents/extractor.mtr -->
```hcl title="maitento/agents/extractor.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You turn messy text into clean, structured data. Never invent a value that is not in the text."
summary = "Extracts structured data from text"
```
<!-- /snippet -->

"Never invent a value" matters here. You'll see why when you break it.

## 2. Write the task

The task takes the text as an input, as in [tutorial 2](02-prompts-and-inputs.md):

<!-- snippet: examples/03-typed-answers/maitento/prompts/extract-recipe-task.md -->
```md title="maitento/prompts/extract-recipe-task.md"
Extract the recipe from the text below.

%%text%%
```
<!-- /snippet -->

The task doesn't describe the shape of the answer. The schema does that.

## 3. Describe the shape of the answer

The shape is a [JSON Schema](https://json-schema.org/) in `json/`:

<!-- snippet: examples/03-typed-answers/maitento/json/recipe.json -->
```json title="maitento/json/recipe.json"
{
  "type": "object",
  "properties": {
    "title": { "type": "string" },
    "servings": { "type": ["integer", "null"] },
    "ingredients": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "item": { "type": "string" },
          "quantity": { "type": ["string", "null"] }
        },
        "required": ["item", "quantity"],
        "additionalProperties": false
      }
    },
    "steps": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["title", "servings", "ingredients", "steps"],
  "additionalProperties": false
}
```
<!-- /snippet -->

Three habits make a schema easy for a model to fill:

- **List every property under `required`.** Your code can then rely on each one being there.
- **Allow `null` for anything the text may not say**, such as `servings`. `null` is how the model says "not given".
- **Set `"additionalProperties": false`**, so there is nothing in the answer your code doesn't expect.

## 4. Point the interaction at the schema

`schema.solution` says what the final answer must look like:

<!-- snippet: examples/03-typed-answers/maitento/interactions/one-shot/extract-recipe.mtr -->
```hcl title="maitento/interactions/one-shot/extract-recipe.mtr"
agent = {
  name = "Extractor"
  agent = @ref("extractor")
}
task = @prompt("extract-recipe-task")
inputs.prompts = [
  {
    name = "text"
    description = "Text that contains a recipe"
    required = true
  }
]
// The answer must match this JSON Schema, so your code can use it directly.
schema.solution = @json("recipe")
```
<!-- /snippet -->

Like a prompt file, `@json("recipe")` is copied in when you deploy. Change the schema, deploy again.

**Done when:** your project has four files: `agents/extractor.mtr`, `interactions/one-shot/extract-recipe.mtr`,
`json/recipe.json` and `prompts/extract-recipe-task.md`.

## 5. Run it and use the answer

The run's `output` is a JSON string that matches the schema. Each script declares the same shape as a type, reads
the JSON into it, and uses the fields:

<!-- tabs -->
<!-- snippet: examples/03-typed-answers/typescript/recipe.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

// The same shape as ../maitento/json/recipe.json.
interface Recipe {
  title: string;
  servings: number | null;
  ingredients: { item: string; quantity: string | null }[];
  steps: string[];
}

const mt = new Maitento();
await mt.deploy("../maitento");

const text = "Grandma's pancakes (serves 4): whisk 200g flour, 2 eggs and 300ml milk. " +
  "Rest 10 minutes, then fry thin pancakes in a little butter.";

const run = await mt.interactions.run("extract-recipe", { inputs: { text } });

// The output is JSON that matches the schema, so it can be used directly.
const recipe = JSON.parse(run.output!) as Recipe;
console.log(`${recipe.title} (serves ${recipe.servings ?? "?"})`);
for (const { item, quantity } of recipe.ingredients) console.log(`- ${quantity ?? ""} ${item}`.trim());
```
<!-- /snippet -->
<!-- snippet: examples/03-typed-answers/python/recipe.py -->
```python title="Python"
import json
from typing import TypedDict

from maitento import Maitento


# The same shape as ../maitento/json/recipe.json.
class Ingredient(TypedDict):
    item: str
    quantity: str | None


class Recipe(TypedDict):
    title: str
    servings: int | None
    ingredients: list[Ingredient]
    steps: list[str]


mt = Maitento()
mt.deploy("../maitento")

text = ("Grandma's pancakes (serves 4): whisk 200g flour, 2 eggs and 300ml milk. "
        "Rest 10 minutes, then fry thin pancakes in a little butter.")

run = mt.interactions.run("extract-recipe", inputs={"text": text})

# The output is JSON that matches the schema, so it can be used directly.
assert run.output is not None  # a finished run always has one
recipe: Recipe = json.loads(run.output)
servings = "?" if recipe["servings"] is None else recipe["servings"]
print(f"{recipe['title']} (serves {servings})")
for ingredient in recipe["ingredients"]:
    print(f"- {ingredient['quantity'] or ''} {ingredient['item']}".strip())
```
<!-- /snippet -->
<!-- snippet: examples/03-typed-answers/csharp/recipe.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using System.Text.Json;
using System.Text.Json.Serialization;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

var text = "Grandma's pancakes (serves 4): whisk 200g flour, 2 eggs and 300ml milk. " +
    "Rest 10 minutes, then fry thin pancakes in a little butter.";

var run = await mt.Interactions.RunAsync("extract-recipe", new Dictionary<string, string> { ["text"] = text });

// The output is JSON that matches the schema, so it can be used directly.
var recipe = JsonSerializer.Deserialize(run.Output!, RecipeJson.Default.Recipe)!;
Console.WriteLine($"{recipe.Title} (serves {recipe.Servings?.ToString() ?? "?"})");
foreach (var (item, quantity) in recipe.Ingredients) Console.WriteLine($"- {quantity} {item}".Trim());

// The same shape as ../maitento/json/recipe.json.
record Recipe(string Title, int? Servings, Ingredient[] Ingredients, string[] Steps);
record Ingredient(string Item, string? Quantity);

// Reads that shape from JSON with camelCase names. The code is generated when the script is built.
[JsonSourceGenerationOptions(JsonSerializerDefaults.Web)]
[JsonSerializable(typeof(Recipe))]
partial class RecipeJson : JsonSerializerContext;
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt interaction-run extract-recipe --input-text "Grandma's pancakes (serves 4): whisk 200g flour, 2 eggs and 300ml milk. Rest 10 minutes, then fry thin pancakes in a little butter."
```
<!-- /tabs -->

Run it from the language's folder in [`examples/03-typed-answers`](../../examples/03-typed-answers/):

<!-- tabs -->
```bash title="TypeScript"
cd examples/03-typed-answers/typescript
npm install
node recipe.ts
```
```bash title="Python"
cd examples/03-typed-answers/python
pip install -r requirements.txt
python recipe.py
```
```bash title="C#"
cd examples/03-typed-answers/csharp
dotnet run recipe.cs
```
```bash title="CLI"
cd examples/03-typed-answers
mt deploy ./maitento
mt interaction-run extract-recipe --input-text "Grandma's pancakes (serves 4): whisk 200g flour, 2 eggs and 300ml milk. Rest 10 minutes, then fry thin pancakes in a little butter."
```
<!-- /tabs -->

**Done when:** your code prints the recipe from the fields it read:

```text
Grandma's pancakes (serves 4)
- 200g flour
- 2 eggs
- 300ml milk
- a little butter
```

The run's `output` was this JSON. Nothing in your code had to understand a sentence:

```json
{"title":"Grandma's pancakes","servings":4,"ingredients":[{"item":"flour","quantity":"200g"},{"item":"eggs","quantity":"2"},{"item":"milk","quantity":"300ml"},{"item":"butter","quantity":"a little"}],"steps":["Whisk 200g flour, 2 eggs and 300ml milk.","Rest 10 minutes, then fry thin pancakes in a little butter."]}
```

## 6. How Maitento makes sure it matches

- **Constrained output:** where the model supports it, the schema is sent with the request, so the model can only
  answer in that shape.
- **Checked every time:** every answer is checked against the schema. If it doesn't match, the model is told what is
  wrong and tries again, up to three times. If it still doesn't match, the run ends with `Error`.

So a `Finished` run with a schema always has an `output` your code can read. More in
[Structured output](../concepts/structured-output.md).

## All the files

<!-- project: examples/03-typed-answers -->
**On GitHub:** [`examples/03-typed-answers`](https://github.com/maitento/maitento/tree/main/examples/03-typed-answers) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/03-typed-answers/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/03-typed-answers/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/03-typed-answers/csharp)

<details>
<summary>All the files in this project (4)</summary>

<!-- tabs: files -->
**`maitento/agents/extractor.mtr`**
```hcl title="maitento/agents/extractor.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You turn messy text into clean, structured data. Never invent a value that is not in the text."
summary = "Extracts structured data from text"
```

**`maitento/interactions/one-shot/extract-recipe.mtr`**
```hcl title="maitento/interactions/one-shot/extract-recipe.mtr"
agent = {
  name = "Extractor"
  agent = @ref("extractor")
}
task = @prompt("extract-recipe-task")
inputs.prompts = [
  {
    name = "text"
    description = "Text that contains a recipe"
    required = true
  }
]
// The answer must match this JSON Schema, so your code can use it directly.
schema.solution = @json("recipe")
```

**`maitento/json/recipe.json`**
```json title="maitento/json/recipe.json"
{
  "type": "object",
  "properties": {
    "title": { "type": "string" },
    "servings": { "type": ["integer", "null"] },
    "ingredients": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "item": { "type": "string" },
          "quantity": { "type": ["string", "null"] }
        },
        "required": ["item", "quantity"],
        "additionalProperties": false
      }
    },
    "steps": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["title", "servings", "ingredients", "steps"],
  "additionalProperties": false
}
```

**`maitento/prompts/extract-recipe-task.md`**
```md title="maitento/prompts/extract-recipe-task.md"
Extract the recipe from the text below.

%%text%%
```
<!-- /tabs -->

</details>

<!-- /project -->

## Break it on purpose

Take away the model's way of saying "not given". In `recipe.json`, make `servings` a plain integer:

```json
    "servings": { "type": "integer" },
```

Then take `(serves 4)` out of the text in your script, and run it again. The answer still matches the schema, but
the number is made up. One run printed this, and another `(serves 0)`:

```text
Grandma's pancakes (serves 1)
```

The text never says how many it serves, and the agent was told never to invent a value. But the schema demanded a
whole number, so the model had to put one there. A schema is a promise your code relies on: make sure it's a promise
the text can keep. Put `"null"` back, and the same text gives `(serves ?)`.

## If it didn't work

- **`JSON file recipes not found (extract-recipe.mtr:14)`**: a `@json("...")` name doesn't match a file under
  `json/`. The name is the file name without `.json`.
- **The run ends `Error: Unable to parse JSON result`**: the model's answer didn't match the schema after three
  tries. Check that the schema can be met: every name under `required` must also be under `properties`, and a field
  the text may lack must allow `null`.
- **C#: an empty title, then `NullReferenceException`**: the JSON's names are camelCase (`title`) and the record's
  are PascalCase (`Title`), so nothing was read. Keep `JsonSerializerDefaults.Web` on the serializer context.
- **`No namespace`**, **`Project folder not found: ../maitento`**, **`[api:model-keys:none-for-provider]`**: see
  [tutorial 1](01-hello-agent.md#if-it-didnt-work).

## Review

You built:

- an extractor that turns free text into JSON of a shape you chose;
- a script that reads that JSON into a typed value, in TypeScript, Python and C#;
- a schema that lets the model say "not given" instead of making something up.

The concept:

- [Structured output](../concepts/structured-output.md): `schema.solution = @json("name")` makes every finished
  answer match a JSON Schema. Maitento constrains the model where it can, checks every answer and retries up to three
  times.

**Challenge:** add a `vegetarian` field (true or false) to the schema, give it a `description` so the model knows
what you mean, read it in your code, and print "vegetarian" after the title when it's true. The solution is in
[`examples/03-typed-answers/solution`](../../examples/03-typed-answers/solution/).

**Next:** [4. Runs](04-runs.md) starts a run without waiting for it, then checks on it.
