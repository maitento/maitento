import time

from maitento import Maitento

FINAL = {"Finished", "Error", "Killed"}

mt = Maitento()
mt.deploy("../maitento")

run = mt.interactions.start("explain", inputs={"topic": "how volcanoes work"})
print(f"Started run {run.id}")

# Let it get going, then stop it.
time.sleep(2)
mt.runs.kill(run.id, type="Interaction")
print("Asked Maitento to kill it")

# A kill takes a moment: read the run back until it has stopped.
stopped = mt.interaction_runs.get(run.id)
while stopped.status not in FINAL:
    time.sleep(0.5)
    stopped = mt.interaction_runs.get(run.id)

print(f"Run {stopped.id}: {stopped.status}")
print(f"Output: {stopped.output or 'none'}")
print(f"Why: {stopped.failure_details}")
