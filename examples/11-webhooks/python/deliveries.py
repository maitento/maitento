import os
import sys

from maitento import Maitento

# The delivery log of the webhook you registered: one entry per update sent, newest first.
url = os.environ.get("WEBHOOK_URL")
if not url:
    sys.exit("Set WEBHOOK_URL to the address you registered.")

mt = Maitento()
hook = next((h for h in mt.webhooks.list() if h.url == url), None)
if hook is None:
    sys.exit(f"No webhook is registered for {url}: run register first.")

for d in mt.webhooks.deliveries(hook.id, limit=5):
    state = "delivered" if d.is_sent else "given up" if d.is_permanent_failure else f"next try {d.next_attempt_time.isoformat()}"
    print(f"run {d.associated_id}: {d.number_attempts} attempt(s), {state}")
    if d.failure_details:
        print(f"  {d.failure_details}")
