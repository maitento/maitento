import sys

from maitento import Maitento

# The challenge: deploy this folder's app, then claim a refund it should refuse.
mt = Maitento()
mt.deploy("../maitento")

expenses = sys.argv[1] if len(sys.argv) > 1 else "Taxi 23.50; Refund -10; Train 41.20"
limit = sys.argv[2] if len(sys.argv) > 2 else "100"
run = mt.apps.run("expenses-strict", inputs={"expenses": expenses, "limit": limit}, throw_on_failure=False)

for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nStatus: {run.status}")
if run.status == "Finished":
    print(f"Returned: {run.return_value}")
    for output in run.outputs:
        print(f'Output "{output.name}": {output.value}')
else:
    print(f"Failure: {run.failure_details}")
