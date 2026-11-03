import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# The app's two inputs: the expenses, as "what amount" pairs separated by semicolons, and the spending limit.
expenses = sys.argv[1] if len(sys.argv) > 1 else "Taxi 23.50; Lunch 12; Hotel ninety; Train 41.20"
limit = sys.argv[2] if len(sys.argv) > 2 else "100"

# throw_on_failure=False hands back a failed run instead of raising, so you can read what it reports.
run = mt.apps.run("expenses", inputs={"expenses": expenses, "limit": limit}, throw_on_failure=False)

for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nStatus: {run.status}")
if run.status == "Finished":
    print(f"Returned: {run.return_value}")
    for output in run.outputs:
        print(f'Output "{output.name}": {output.value}')
else:
    print(f"Failure: {run.failure_details}")
