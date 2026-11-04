#:package Maitento.Sdk@26.11.1

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
