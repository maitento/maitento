import os
import sys

from maitento import Maitento

# Run sandbox.py first: the workbench capsule mounts the sales-data file system it creates.
mt = Maitento()
mt.deploy("../maitento")

question = sys.argv[1] if len(sys.argv) > 1 else "Which region brought in the most revenue, and how much?"

# The app starts the workbench capsule, then lets the analyst run commands in it until it can answer.
run = mt.apps.run(
    "analyst",
    inputs={"question": question, "namespaceName": os.environ.get("MAITENTO_NAMESPACE", "tutorials")},
)

for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nAnswer: {run.return_value}")
