# Tutorial 12's challenge: whenever one of your runs ends, say how long it worked and how many tokens it used.
import time

from maitento import Event, Maitento

FINAL = {"Finished", "Error", "Killed"}

mt = Maitento()
events = mt.events.connect()
print("Waiting for your runs to end. Press Ctrl+C to stop.")


def ended(event: Event) -> None:
    run = event.data
    if run.status not in FINAL:
        return
    # The event carries the whole run. Its summary (tutorial 4) adds up the tokens.
    tokens = mt.runs.get(run.id).tokens
    assert tokens is not None  # interaction runs always count them
    seconds = run.execution_time.total_seconds()
    print(f"{run.id}  {run.status} after {seconds:.1f}s, {tokens.input} tokens in and {tokens.output} out")


events.on("interaction-process-updated", ended)

# The events arrive on another thread: this one just waits.
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    mt.close()
