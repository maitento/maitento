import sys
from pathlib import Path

from maitento import Maitento

# The challenge: deploy this folder's app, then total a list of orders.
mt = Maitento()
mt.deploy("../maitento")

orders = sys.argv[1] if len(sys.argv) > 1 else Path("../data/orders.json").read_text(encoding="utf-8")
run = mt.apps.run("orders-total", inputs={"orders": orders})

for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nReturned: {run.return_value}")
for output in run.outputs:
    print(f'Output "{output.name}": {output.value}')
