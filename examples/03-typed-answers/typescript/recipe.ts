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
