import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# Run the shipping app. Its main(string weights, string destination) parameters are its inputs.
args = sys.argv[1:]
weights = args[0] if len(args) > 0 else "0.4, 3, kg, 12.5, , 45, 7"
destination = args[1] if len(args) > 1 else "UK"
run = mt.apps.run("shipping", inputs={"weights": weights, "destination": destination})

# What the app printed, what it returned, and every named output, in the order the app first set them.
for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nReturned: {run.return_value}")
for output in run.outputs:
    print(f'Output "{output.name}": {output.value}')
