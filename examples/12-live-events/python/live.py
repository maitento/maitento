import sys
import threading
import time

from maitento import Event, Maitento
from maitento.models import InteractionProcess

FINAL = {"Finished", "Error", "Killed"}


class Follower:
    """Says whenever the run's status changes, and sets `ended` once the run has ended. Events (on the event thread)
    and read-backs (on this one) can overtake each other, so anything older than the newest state shown is ignored."""

    def __init__(self) -> None:
        self.latest: InteractionProcess | None = None
        self.ended = threading.Event()
        self.lock = threading.Lock()

    def show(self, run: InteractionProcess) -> None:
        with self.lock:
            if self.latest and run.date_updated < self.latest.date_updated:
                return
            if not self.latest or run.status != self.latest.status:
                print(f"\n[{run.status}]")
            self.latest = run
            if run.status in FINAL:
                self.ended.set()

    # The reply, a few words at a time, as the model writes it.
    def write(self, event: Event) -> None:
        if event.data.type == "Chat":
            print(event.data.stream, end="", flush=True)


mt = Maitento()
mt.deploy("../maitento")

# One WebSocket to Maitento. Every change to your runs arrives over it.
events = mt.events.connect()

# Follow the run whose id you pass, or start a new one.
run_id = sys.argv[1] if len(sys.argv) > 1 else mt.interactions.start("describe", inputs={"place": "Lisbon"}).id
print(f"Following run {run_id}")

follower = Follower()

# The whole run, every time it changes; and the reply as it's written.
events.on("interaction-process-updated", lambda event: follower.show(event.data), id=run_id)
events.on("interaction-process-stream", follower.write, id=run_id)

# Events sent while the connection was down are lost, so read the run again when it comes back.
events.on("reconnected", lambda event: follower.show(mt.interaction_runs.get(run_id)))

# Events only tell you about changes from now on. The run may already have moved, or even ended: read it once now.
follower.show(mt.interaction_runs.get(run_id))

# Wait until the run has ended. (A short sleep in a loop, so Ctrl+C works on every platform.)
while not follower.ended.is_set():
    time.sleep(0.2)

run = mt.interaction_runs.get(run_id)
print(f"Output: {len(run.output or '')} characters")
mt.close()
