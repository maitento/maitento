import os
import sys
import time
from pathlib import Path

from maitento import Maitento

# The key your app's API checks, and where Maitento sends run updates: your app's public URL + /maitento/webhook.
api_key = os.environ.get("SHOP_API_KEY")
webhook_url = os.environ.get("WEBHOOK_URL")
webhook_secret = os.environ.get("WEBHOOK_SECRET")
if not api_key or not webhook_url or not webhook_secret:
    sys.exit("Set SHOP_API_KEY, WEBHOOK_URL and WEBHOOK_SECRET first.")

mt = Maitento()
namespace = os.environ.get("MAITENTO_NAMESPACE", "tutorials")

# 1. The key the tools send to your app, kept as a secret (tutorial 9).
secret = mt.secrets.find_by_name("shop-api-key")
if secret:
    mt.secrets.update(secret.id, name="shop-api-key", value=api_key)
else:
    mt.secrets.create("shop-api-key", api_key)

# 2. The desk's file system, with the report script in it. The capsule mounts it, so it must exist
#    before the deploy (tutorials 15 and 21).
if not mt.namespaces.find(namespace):
    mt.namespaces.create(namespace)
if not mt.vfs.find_by_name("support-desk"):
    mt.vfs.create("support-desk")
script = Path("../data/count_tickets.py").read_text(encoding="utf-8")
mt.vfs.open("support-desk").write_text("/count_tickets.py", script)

# 3. The shop's policies in a knowledge base (tutorial 13), and a temporary one for web pages (tutorial 14).
partitions = mt.partitions.list()
policies = next((p for p in partitions if p.name == "shop-policies" and not p.is_temporary), None)
if policies is None:
    policies = mt.partitions.create("shop-policies")
for file in sorted(Path("../knowledge").iterdir()):
    mt.files.upload(policies.id, file)
if not any(p.name == "web-downloads" and p.is_temporary for p in partitions):
    mt.partitions.create("web-downloads", is_temporary=True, file_lifetime_hours=24)

# 4. The agents, tools, app and capsule.
mt.deploy("../maitento")

# 5. Maitento calls your app whenever an interaction run (a reply) or an app run (the digest) changes (tutorial 11).
hooks = mt.webhooks.list()
for kind in ("InteractionProcess", "AppProcess"):
    if not any(hook.url == webhook_url and hook.type == kind for hook in hooks):
        mt.webhooks.create(type=kind, url=webhook_url, secret=webhook_secret)

# 6. The nightly digest runs at 23:55 UTC (tutorial 17). An automation runs the app version it names,
#    so running setup again points it at the version just deployed.
app = mt.apps.get_by_name("nightly-digest")
latest = max(v.version for v in app.versions)
digest = {
    "name": "nightly-digest",
    "description": "Counts the day's support tickets",
    "actions": [{
        "name": "write-digest",
        "config": {
            "$type": "app",
            "version": {"id": app.id, "version": latest},
            "inputs": [{"name": "namespaceName", "value": namespace}],
        },
    }],
}
existing = mt.automations.find_by_name("nightly-digest")
automation = mt.automations.update(existing.id, digest) if existing else mt.automations.create(digest)
if not any(s.name == "every-night" for s in automation.schedules):
    mt.automations.add_schedule(automation.id, name="every-night", minute="55", hour="23")

# The policies take a few seconds to index. Wait until the agent can search them.
while True:
    files = list(mt.partitions.files(policies.id))
    if files and all(f.is_vector_generated for f in files):
        break
    time.sleep(2)
print("The support desk is set up. Start the app with: uvicorn server:app --port 3000")
