import sys

from maitento import Maitento

# The challenge: deploy this folder's app, shipping-report, and run it with the tutorial's parcels.
mt = Maitento()
mt.deploy("../maitento")

args = sys.argv[1:]
weights = args[0] if len(args) > 0 else "0.4, 3, kg, 12.5, , 45, 7"
destination = args[1] if len(args) > 1 else "UK"
run = mt.apps.run("shipping-report", inputs={"weights": weights, "destination": destination})
for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nReturned: {run.return_value}")
