import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# Run the receipt app. Its main(string item, decimal price, int quantity) parameters are its inputs,
# and every input goes in as text.
args = sys.argv[1:]
item = args[0] if len(args) > 0 else "Notebook"
price = args[1] if len(args) > 1 else "4.5"
quantity = args[2] if len(args) > 2 else "3"
run = mt.apps.run("receipt", inputs={"item": item, "price": price, "quantity": quantity})

# What the app printed, what it returned, and every named output, in the order the app first set them.
for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nReturned: {run.return_value}")
for output in run.outputs:
    print(f'Output "{output.name}": {output.value}')
