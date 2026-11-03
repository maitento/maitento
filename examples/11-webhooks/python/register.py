import os
import sys

from maitento import Maitento

# Where Maitento should send interaction updates, and the secret it signs each one with.
url = os.environ.get("WEBHOOK_URL")
secret = os.environ.get("WEBHOOK_SECRET")
if not url or not secret:
    sys.exit("Set WEBHOOK_URL (your receiver's public address) and WEBHOOK_SECRET first.")

mt = Maitento()
hook = mt.webhooks.create(type="InteractionProcess", url=url, secret=secret)
print(f"Webhook {hook.id} registered: interaction updates will be sent to {url}")
