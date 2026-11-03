import time

from maitento import Maitento

FINAL = {"Finished", "Error", "Killed"}

mt = Maitento()
mt.deploy("../maitento")

started = time.monotonic()
run = mt.interactions.start("explain", inputs={"topic": "how rainbows form"})
print(f"Started run {run.id}")

# Read the run once a second until it ends, and say whenever its status changes.
status = ""
while True:
    if run.status != status:
        status = run.status
        print(f"{time.monotonic() - started:.1f}s  {status}")
    if run.status in FINAL:
        break
    time.sleep(1)
    run = mt.interaction_runs.get(run.id)

# A finished run has its answer in output; one that failed or was killed says why in failure_details.
print(f"{(run.output or '')[:160]}…" if run.status == "Finished" else run.failure_details)
