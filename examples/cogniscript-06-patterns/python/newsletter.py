import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# Run the newsletter app. It runs the headlines app itself, as a child.
topics = sys.argv[1] if len(sys.argv) > 1 else "electric cars, city farming, space tourism, quantum computing"
run = mt.apps.run("newsletter", inputs={"topics": topics})

for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nReturned: {run.return_value}")
for output in run.outputs:
    print(f'Output "{output.name}": {output.value}')
