import sys
import time
from datetime import datetime

from maitento import Event, Maitento

mt = Maitento()


def now() -> str:
    return datetime.now().strftime("%H:%M:%S")


# "user" (the default) carries your own runs, whole. "tenant" carries a short summary of every run in the tenant.
tenant = sys.argv[1:] == ["tenant"]
events = mt.events.connect("tenant" if tenant else "user")
print(f"Watching {'every run in the tenant' if tenant else 'your runs'}. Press Ctrl+C to stop.")

# User scope: an interaction run changed. (Apps, capsules and code pipelines have events of their own.)
events.on("interaction-process-updated", lambda e: print(f"{now()}  {e.data.id}  {e.data.status}"))

# Tenant scope: any run of any kind changed.
events.on("process-updated", lambda e: print(f"{now()}  {e.data.id}  {e.data.status}  ({e.data.type})"))


# The SDK reconnects by itself. Anything that changed in between was missed, so read what matters again.
def reconnected(event: Event) -> None:
    active = mt.runs.list(state="Active", namespace=mt.namespace)
    print(f"{now()}  Reconnected. Runs still going: {len(active.items)}")
    for run in active.items:
        print(f"{now()}  {run.id}  {run.status}")


events.on("disconnected", lambda e: print(f"{now()}  Connection lost. Reconnecting…"))
events.on("reconnected", reconnected)

# The events arrive on another thread: this one just waits.
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    mt.close()
