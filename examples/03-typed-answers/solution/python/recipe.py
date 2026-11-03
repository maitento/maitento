import json
from typing import TypedDict

from maitento import Maitento


# The same shape as ../maitento/json/recipe.json, now with vegetarian.
class Ingredient(TypedDict):
    item: str
    quantity: str | None


class Recipe(TypedDict):
    title: str
    servings: int | None
    vegetarian: bool
    ingredients: list[Ingredient]
    steps: list[str]


mt = Maitento()
# A deploy copies the schema into the interaction, so the interaction gets a new version.
mt.deploy("../maitento")

text = ("Grandma's pancakes (serves 4): whisk 200g flour, 2 eggs and 300ml milk. "
        "Rest 10 minutes, then fry thin pancakes in a little butter.")

run = mt.interactions.run("extract-recipe", inputs={"text": text})

assert run.output is not None  # a finished run always has one
recipe: Recipe = json.loads(run.output)
servings = "?" if recipe["servings"] is None else recipe["servings"]
vegetarian = " - vegetarian" if recipe["vegetarian"] else ""
print(f"{recipe['title']} (serves {servings}){vegetarian}")
for ingredient in recipe["ingredients"]:
    print(f"- {ingredient['quantity'] or ''} {ingredient['item']}".strip())
