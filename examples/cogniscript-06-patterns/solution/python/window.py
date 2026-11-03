import sys

from maitento import Maitento

# The challenge: deploy the tutorial's project, then this folder's app, which uses its headline interaction.
mt = Maitento()
mt.deploy("../../maitento")
mt.deploy("../maitento")

topics = sys.argv[1] if len(sys.argv) > 1 else "electric cars, city farming, space tourism, quantum computing"
run = mt.apps.run("headlines-window", inputs={"topics": topics})

for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nReturned: {run.return_value}")
for output in run.outputs:
    print(f'Output "{output.name}": {output.value}')
