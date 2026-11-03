import sys

from maitento import Maitento

# The challenge: deploy this folder's app, compare, and quote the tutorial's parcels for three destinations.
mt = Maitento()
mt.deploy("../maitento")

args = sys.argv[1:]
weights = args[0] if len(args) > 0 else "0.4, 3, kg, 12.5, , 45, 7"
destinations = args[1] if len(args) > 1 else "UK, EU, World"
run = mt.apps.run("compare", inputs={"weights": weights, "destinations": destinations})
for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nReturned: {run.return_value}")
