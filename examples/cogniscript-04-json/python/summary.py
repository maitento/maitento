import sys
from pathlib import Path

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# The order goes in as JSON text: an app's inputs are always text.
order = sys.argv[1] if len(sys.argv) > 1 else Path("../data/order.json").read_text(encoding="utf-8")
run = mt.apps.run("order-summary", inputs={"order": order})

# What the app printed, what it returned, and every named output, in the order the app first set them.
for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nReturned: {run.return_value}")
for output in run.outputs:
    print(f'Output "{output.name}": {output.value}')
