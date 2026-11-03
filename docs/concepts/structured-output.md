---
title: Structured output
description: Make an interaction answer with JSON that matches a schema, so your code can use it directly.
sidebar:
  order: 5
---

# Structured output

By default an interaction answers in prose. Give it a **JSON Schema** and it answers with JSON that matches the
schema instead, so your code can read fields rather than parse sentences. See it in
[tutorial 3, Typed answers](../tutorials/03-typed-answers.md), which turns a messy recipe into JSON.

## Add a schema

Put the schema in `json/`, and point the interaction's `schema.solution` at it:

<!-- snippet: examples/03-typed-answers/maitento/json/recipe.json -->
```json title="json/recipe.json"
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

<!-- snippet: examples/03-typed-answers/maitento/interactions/one-shot/extract-recipe.mtr -->
```hcl title="interactions/one-shot/extract-recipe.mtr"
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

The run's `output` is then a JSON string that matches the schema:

```json
{
  "title": "Grandma's pancakes",
  "servings": 4,
  "ingredients": [
    { "item": "flour", "quantity": "200g" },
    { "item": "eggs", "quantity": "2" },
    { "item": "milk", "quantity": "300ml" },
    { "item": "butter", "quantity": "a little" }
  ],
  "steps": ["Whisk the flour, eggs and milk.", "Rest 10 minutes, then fry thin pancakes in butter."]
}
```

## How Maitento makes sure it matches

- With models that support it, the schema is sent to the provider, which constrains the model's answer to it.
- Every answer is checked against the schema. A small fix-up is tried first (a stray code fence, say). If the answer
  still doesn't match, the model is told what is wrong and tries again. After the third answer that doesn't match,
  the run ends with `Error`, and its `failureDetails` say "Unable to parse JSON result".

So a `Finished` run with a schema always has an `output` your code can read.

## Writing schemas that work well

- **Set `"additionalProperties": false`** on every object, and list every property under `required`.
- **For something that may be missing, allow `null`** rather than leaving it out of `required`:
  `"servings": { "type": ["integer", "null"] }`. Without a way to say "not given", the model has to make a value up
  to match the schema, as [tutorial 3](../tutorials/03-typed-answers.md#break-it-on-purpose) shows.
- **Describe fields** with `"description"` when the name alone isn't obvious. The model reads it.
- **Keep it small.** Ask for what your code needs, not everything that could be extracted.

## A different schema for one run

You can pass `responseJsonSchema` (a JSON Schema, as a string) when you start a run, which overrides the
interaction's schema for that run only. A schema that isn't valid JSON Schema is refused before the run starts, with
`api:interactions:response-schema-invalid`.

## Reading it in your code

<!-- tabs -->
```ts
const run = await mt.interactions.run("extract-recipe", { inputs: { text } });
const recipe = JSON.parse(run.output!) as Recipe;
```
```python
run = mt.interactions.run("extract-recipe", inputs={"text": text})
recipe = json.loads(run.output)
```
```csharp
var run = await mt.Interactions.RunAsync("extract-recipe", new Dictionary<string, string> { ["text"] = text });
// In a .NET file-based app, pass a source-generated JsonSerializerContext instead, as tutorial 3 does.
var recipe = JsonSerializer.Deserialize<Recipe>(run.Output!, JsonSerializerOptions.Web)!;
```
<!-- /tabs -->

[Tutorial 3, Typed answers](../tutorials/03-typed-answers.md) builds this end to end, with typed classes in each
language. Its C# reads the JSON with a source-generated serializer, which a .NET file-based app needs: those are set
up for ahead-of-time compilation, which turns reflection-based JSON off, so the line above throws there.
