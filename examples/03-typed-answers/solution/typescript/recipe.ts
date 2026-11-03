import { Maitento } from "@maitento/sdk";

// The same shape as ../maitento/json/recipe.json, now with vegetarian.
interface Recipe {
  title: string;
  servings: number | null;
  vegetarian: boolean;
  ingredients: { item: string; quantity: string | null }[];
  steps: string[];
}

const mt = new Maitento();
// A deploy copies the schema into the interaction, so the interaction gets a new version.
await mt.deploy("../maitento");

const text = "Grandma's pancakes (serves 4): whisk 200g flour, 2 eggs and 300ml milk. " +
  "Rest 10 minutes, then fry thin pancakes in a little butter.";

const run = await mt.interactions.run("extract-recipe", { inputs: { text } });

const recipe = JSON.parse(run.output!) as Recipe;
console.log(`${recipe.title} (serves ${recipe.servings ?? "?"})${recipe.vegetarian ? " - vegetarian" : ""}`);
for (const { item, quantity } of recipe.ingredients) console.log(`- ${quantity ?? ""} ${item}`.trim());
