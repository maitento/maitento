#:package Maitento.Sdk@26.10.0

using System.Text.Json;
using System.Text.Json.Serialization;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
// A deploy copies the schema into the interaction, so the interaction gets a new version.
await mt.DeployAsync("../maitento");

var text = "Grandma's pancakes (serves 4): whisk 200g flour, 2 eggs and 300ml milk. " +
    "Rest 10 minutes, then fry thin pancakes in a little butter.";

var run = await mt.Interactions.RunAsync("extract-recipe", new Dictionary<string, string> { ["text"] = text });

var recipe = JsonSerializer.Deserialize(run.Output!, RecipeJson.Default.Recipe)!;
var vegetarian = recipe.Vegetarian ? " - vegetarian" : "";
Console.WriteLine($"{recipe.Title} (serves {recipe.Servings?.ToString() ?? "?"}){vegetarian}");
foreach (var (item, quantity) in recipe.Ingredients) Console.WriteLine($"- {quantity} {item}".Trim());

// The same shape as ../maitento/json/recipe.json, now with Vegetarian.
record Recipe(string Title, int? Servings, bool Vegetarian, Ingredient[] Ingredients, string[] Steps);
record Ingredient(string Item, string? Quantity);

// Reads that shape from JSON with camelCase names. The code is generated when the script is built.
[JsonSourceGenerationOptions(JsonSerializerDefaults.Web)]
[JsonSerializable(typeof(Recipe))]
partial class RecipeJson : JsonSerializerContext;
