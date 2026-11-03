# Receives Maitento webhooks: Maitento PUTs the latest state of a run every time it changes.
# Run it with: uvicorn receiver:app --port 3001
import os
from datetime import datetime

from fastapi import FastAPI, Request, Response
from maitento import parse_webhook, verify_webhook

SECRET = os.environ.get("WEBHOOK_SECRET") or ""
if not SECRET:
    raise RuntimeError("Set WEBHOOK_SECRET to the secret you registered the webhook with.")

FINISHED = {"Finished", "Error", "Killed"}
latest: dict[str, datetime] = {}  # run id -> dateUpdated of the newest delivery we have seen

app = FastAPI()


@app.put("/maitento/webhook")
async def webhook(request: Request) -> Response:
    # Every delivery is signed with your secret. verify_webhook checks the signature against the raw body, exactly as
    # it arrived, and that the delivery was signed in the last 5 minutes.
    body = await request.body()
    if not verify_webhook(request.headers, body, SECRET):
        print("401: a delivery without a valid signature")
        return Response(status_code=401)

    delivery = parse_webhook(request.headers, body)
    if delivery.type != "InteractionProcess":
        return Response(status_code=204)
    run = delivery.entity

    # Deliveries can arrive more than once and out of order: keep only the newest state of each run.
    seen = latest.get(run.id)
    if seen is not None and seen >= run.date_updated:
        return Response(status_code=204)
    latest[run.id] = run.date_updated

    print(f"{delivery.type} {run.id} is now {run.status}")
    if run.status in FINISHED and run.output:
        print(f"  output: {run.output}")

    # Answer quickly: Maitento waits up to 100 seconds, then tries again later.
    return Response(status_code=204)
