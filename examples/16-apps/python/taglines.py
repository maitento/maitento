import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# Run the taglines app. Its main(string product) parameter is its one input.
product = sys.argv[1] if len(sys.argv) > 1 else "a reusable bamboo coffee cup"
run = mt.apps.run("taglines", inputs={"product": product})

# What the app printed, what it returned, and its named output.
for line in run.console_outputs:
    print(line.text.rstrip())
taglines = next((output for output in run.outputs if output.name == "taglines"), None)
print(f"\nReturned: {run.return_value}")
print(f'Output "taglines": {taglines.value if taglines else None}')
