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
