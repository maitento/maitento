import sys

from maitento import Maitento

# The challenge: deploy this folder's app, which takes a fourth input, discount.
mt = Maitento()
mt.deploy("../maitento")

args = sys.argv[1:]
item = args[0] if len(args) > 0 else "Notebook"
price = args[1] if len(args) > 1 else "4.5"
quantity = args[2] if len(args) > 2 else "3"
discount = args[3] if len(args) > 3 else "10"
run = mt.apps.run("discount-receipt", inputs={"item": item, "price": price, "quantity": quantity, "discount": discount})
for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nReturned: {run.return_value}")
