import sys
import time

from maitento import Maitento

mt = Maitento()
user_name = sys.argv[1] if len(sys.argv) > 1 else "Ana"

namespace = mt.namespaces.find(mt.namespace or "tutorials")
looms = mt.looms.list(namespace.id) if namespace else []
loom = next((l for l in looms if l.name == f"wren-chat/Wren/{user_name}"), None)
if not loom:
    sys.exit(f"Wren has no memory of {user_name} yet: talk to it first.")

# Ask for a night weave now, instead of waiting for five quiet minutes. It runs in the background.
latest = mt.looms.night_weavings(loom.id, limit=1)
before = latest[0].id if latest else None
mt.looms.night_weave(loom.id)
print("Night weaving…")

# Wait for the new night weaving to finish.
while True:
    latest = mt.looms.night_weavings(loom.id, limit=1)
    if latest and latest[0].id != before and latest[0].status != "Running":
        break
    time.sleep(2)
night = latest[0]
counts = night.counts
print(
    f"{night.status}. Conversations: {counts.sessions_consolidated}, "
    f"threads merged: {counts.threads_merged}, portraits: {counts.panels_woven}\n"
)

# The portrait night weaving wrote of each person, which Wren reads first when it next talks to them.
for panel in mt.looms.panels(loom.id):
    print(f"## {panel.subject}\n{panel.text}\n")
