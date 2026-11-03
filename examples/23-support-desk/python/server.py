# Acme Coffee's support desk: the console's API (/api), the webhook Maitento calls (/maitento/webhook), and the shop
# API the desk's tools call (/shop). The page itself is ../web, served as it is. The API is described in ../web/API.md.
# Run it with: uvicorn server:app --port 3000
import asyncio
import hmac
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import BackgroundTasks, FastAPI, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from maitento import AsyncMaitento, parse_webhook, verify_webhook

API_KEY = os.environ.get("SHOP_API_KEY", "")
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "")
if not API_KEY or not WEBHOOK_SECRET:
    raise RuntimeError("Set SHOP_API_KEY and WEBHOOK_SECRET, the values you gave setup.py.")

mt = AsyncMaitento()
desk_files = mt.vfs.open("support-desk")
app = FastAPI()

# The desk's state, saved in desk.json so it survives a restart. Reset starts again from ../data/orders.json.
DESK_FILE = Path(os.environ.get("DESK_FILE", "desk.json"))
Ticket = dict[str, Any]


def fresh_desk() -> dict[str, Any]:
    return {"tickets": [], "orders": json.loads(Path("../data/orders.json").read_text(encoding="utf-8"))}


desk = json.loads(DESK_FILE.read_text(encoding="utf-8")) if DESK_FILE.exists() else fresh_desk()


def save() -> None:
    DESK_FILE.write_text(json.dumps(desk, indent=2), encoding="utf-8")


def find_ticket(ticket_id: str) -> Optional[Ticket]:
    return next((t for t in desk["tickets"] if t["id"] == ticket_id), None)


def error(message: Any, status: int) -> JSONResponse:
    return JSONResponse({"error": str(message)}, status_code=status)


# The browser listens on /api/events, and hears about every change as it happens (Server-Sent Events).
# region: events
listeners: set[asyncio.Queue[str]] = set()


def send(event: str, data: Any) -> None:
    for queue in listeners:
        queue.put_nowait(f"event: {event}\ndata: {json.dumps(data)}\n\n")


def changed(ticket: Ticket) -> None:
    save()
    send("ticket", ticket)


@app.get("/api/events")
async def events() -> StreamingResponse:
    async def stream():
        queue: asyncio.Queue[str] = asyncio.Queue()
        listeners.add(queue)
        try:
            yield ": connected\n\n"
            while True:
                try:
                    yield await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield "event: ping\ndata: {}\n\n"  # keeps proxies from closing a quiet stream
        finally:
            listeners.discard(queue)

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})
# endregion


# The two knowledge bases setup made: the shop's policies, and a temporary one for web pages the agent reads.
knowledge_bases: dict[str, str] = {}


async def find_knowledge_bases() -> dict[str, str]:
    if not knowledge_bases:
        for p in await mt.partitions.list():
            if (p.name, p.is_temporary) in (("shop-policies", False), ("web-downloads", True)):
                knowledge_bases[p.name] = p.id
        if len(knowledge_bases) < 2:
            knowledge_bases.clear()
            raise RuntimeError("The shop-policies knowledge base is missing: run setup.py first.")
    return knowledge_bases


@app.get("/api/status")
async def status() -> dict[str, Any]:
    try:
        await find_knowledge_bases()
        return {"ok": True, "error": None}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/tickets")
async def list_tickets() -> dict[str, Any]:
    return {"tickets": desk["tickets"]}


@app.get("/api/scenarios")
async def scenarios() -> dict[str, Any]:
    return {"scenarios": json.loads(Path("../data/scenarios.json").read_text(encoding="utf-8"))}


# 1. A ticket comes in: triage it, then start drafting the reply.
# region: ticket
class NewTicket(BaseModel):
    customer: str = ""
    email: str = ""
    subject: str = ""
    message: str = ""


@app.post("/api/tickets", status_code=201, response_model=None)
async def new_ticket(body: NewTicket, background: BackgroundTasks) -> Ticket | JSONResponse:
    if not body.customer.strip() or "@" not in body.email or not body.message.strip():
        return error("A ticket needs a customer, an email address and a message.", 400)
    ticket: Ticket = {
        "id": f"T-{1001 + len(desk['tickets'])}", "customer": body.customer.strip(), "email": body.email.strip(),
        "subject": body.subject.strip(), "message": body.message.strip(),
        "created": datetime.now(timezone.utc).isoformat(), "status": "new", "triage": None, "runId": None,
        "loomId": None, "updated": None, "approval": None, "decision": None, "steps": [], "reply": None, "error": None,
    }
    desk["tickets"].insert(0, ticket)
    changed(ticket)
    background.add_task(work, ticket)  # the browser hears how it goes over /api/events
    return ticket


async def work(ticket: Ticket) -> None:
    try:
        # Triage takes a few seconds and answers in JSON, so wait for it (tutorial 3).
        triage = await mt.interactions.run("triage-ticket", inputs={"message": ticket["message"]})
        ticket["triage"] = json.loads(triage.output or "{}")
        ticket["status"] = "triaged"
        changed(ticket)

        # The reply can take a minute, and may wait for a person to approve a refund.
        # Start it and move on: the webhook says when it changes (tutorial 11).
        kb = await find_knowledge_bases()
        inputs = {"customer": ticket["customer"], "email": ticket["email"], "message": ticket["message"],
                  "category": ticket["triage"]["category"], "urgency": ticket["triage"]["urgency"],
                  "policiesId": kb["shop-policies"]}
        if ticket["triage"]["orderId"]:
            inputs["orderId"] = ticket["triage"]["orderId"]
        run = await mt.interactions.start(
            "draft-reply",
            inputs=inputs,
            web_download_partition_id=kb["web-downloads"],  # where web pages the agent reads are kept (tutorial 14)
        )
        ticket["runId"] = run.id
        ticket["loomId"] = run.looms[0].loom if run.looms else None  # this customer's memory (tutorial 20)
        ticket["status"] = "drafting"
        changed(ticket)
    except Exception as e:
        ticket["status"] = "failed"
        ticket["error"] = str(e)
        changed(ticket)
# endregion


# 2. Maitento calls this whenever an interaction run or an app run changes (tutorial 11).
# region: webhook
@app.put("/maitento/webhook")
async def webhook(request: Request, background: BackgroundTasks) -> Response:
    body = await request.body()  # the raw body, which the signature covers
    if not verify_webhook(request.headers, body, WEBHOOK_SECRET):
        return Response(status_code=401)
    delivery = parse_webhook(request.headers, body)
    if delivery.type == "InteractionProcess":
        background.add_task(run_changed, delivery.entity)  # answer at once, and do the work after
    elif delivery.type == "AppProcess":
        digest_changed(delivery.entity)
    return Response(status_code=204)


async def run_changed(run: Any) -> None:
    # Webhooks come for every run in the tenant: keep only this desk's. Deliveries can repeat and arrive out of
    # order, so keep only the newest state of each run.
    ticket = next((t for t in desk["tickets"] if t["runId"] == run.id), None)
    updated = run.date_updated.isoformat(timespec="microseconds")

    def is_old() -> bool:
        return ticket is not None and ticket["updated"] is not None and updated <= ticket["updated"]

    if ticket is None or is_old():
        return
    steps = await tool_calls(run, ticket["steps"])
    if is_old():
        return  # a newer delivery got here while the tool results were being read

    approval = run.pending_approval if run.status == "PendingApproval" else None
    ticket["updated"] = updated
    ticket["steps"] = steps
    ticket["approval"] = approval and {"id": approval.id, "tool": approval.function_name,
                                       "arguments": approval.arguments_json}
    ticket["reply"] = run.output
    ticket["error"] = run.failure_details
    if run.status == "PendingApproval":
        ticket["status"] = "approval"
    elif run.status == "Finished":
        rejected = ticket["decision"] is not None and not ticket["decision"]["approved"]
        ticket["status"] = "rejected" if rejected else "replied"
    elif run.status in ("Error", "Killed"):
        ticket["status"] = "failed"
    else:
        ticket["status"] = "drafting"
    changed(ticket)
# endregion


# What the agent did: each tool call and its result. A long result is kept outside the run, so read it once.
# region: steps
async def tool_calls(run: Any, known: list[dict[str, Any]]) -> list[dict[str, Any]]:
    steps = []
    for call in run.context.tool_call:
        result = next((r for r in run.context.tool_result if r.tool_call_id == call.tool_call_id), None)
        output = result.result if result else None
        if result and output is None:
            output = next((s["output"] for s in known if s["id"] == call.tool_call_id), None)
        if result and output is None:
            output = (await mt.interaction_runs.tool_result(run.id, result.sequence)).result
        steps.append({
            "id": call.tool_call_id, "tool": call.function_name, "input": call.arguments_json, "output": output,
            "error": result.is_error if result else False, "rejection": result.rejection_reason if result else None,
        })
    return steps
# endregion


# 3. A person approves or rejects the refund the agent asked for (tutorial 10).
# region: approval
class Decision(BaseModel):
    reason: str = ""


@app.post("/api/tickets/{ticket_id}/{decision}", response_model=None)
async def decide(ticket_id: str, decision: str, body: Decision) -> Ticket | JSONResponse:
    ticket = find_ticket(ticket_id)
    approval = ticket["approval"] if ticket else None
    if ticket is None or approval is None or decision not in ("approve", "reject"):
        return error("This ticket isn't waiting for an approval.", 409)
    approve = decision == "approve"
    reason = body.reason.strip() or "The support team said no."
    ticket["approval"] = None  # a second click finds nothing to decide
    ticket["decision"] = {"approved": approve, "reason": None if approve else reason}
    ticket["status"] = "drafting"
    changed(ticket)
    try:
        if approve:
            await mt.interaction_runs.approve(ticket["runId"], approval["id"])
        else:
            await mt.interaction_runs.reject(ticket["runId"], approval["id"], reason)
        return ticket
    except Exception as e:
        ticket.update(approval=approval, decision=None, status="approval")
        changed(ticket)
        return error(e, 502)
# endregion


# 4. What the desk remembers about a ticket's customer: the threads of their memory (tutorial 20).
# region: memory
@app.get("/api/tickets/{ticket_id}/memory", response_model=None)
async def memory(ticket_id: str) -> dict[str, Any] | JSONResponse:
    ticket = find_ticket(ticket_id)
    loom_id = ticket["loomId"] if ticket else None
    try:
        threads = await mt.looms.threads(loom_id, sort="Newest", limit=20) if loom_id else []
        return {"threads": [{"content": t.content, "kind": t.kind, "created": t.date_created.isoformat()}
                            for t in threads]}
    except Exception as e:
        return error(e, 502)
# endregion


# 5. The nightly digest: the latest report the capsule wrote, and running it now (tutorials 16, 17 and 21).
# region: digest
digest: dict[str, Any] = {"running": False, "error": None}


async def read_report(path: str) -> Optional[str]:
    return await desk_files.read_text(path) if await desk_files.exists(path) else None


@app.get("/api/digest", response_model=None)
async def get_digest() -> dict[str, Any] | JSONResponse:
    try:
        report, counts = await asyncio.gather(read_report("/reports/latest.md"), read_report("/reports/latest.json"))
        return {**digest, "report": report, "counts": json.loads(counts) if counts else None}
    except Exception as e:
        return error(e, 502)


@app.post("/api/digest", status_code=202, response_model=None)
async def run_digest() -> dict[str, Any] | JSONResponse:
    try:
        automation = await mt.automations.get_by_name("nightly-digest")
        await mt.automations.trigger(automation.id)
        digest.update(running=True, error=None)
        send("digest", digest)
        return digest
    except Exception as e:
        return error(e, 502)


def digest_changed(run: Any) -> None:
    if run.triggered_by_automated_action_name != "nightly-digest":
        return
    ended = run.status in ("Finished", "Error", "Killed")
    digest.update(running=not ended,
                  error=(run.failure_details or run.status) if ended and run.status != "Finished" else None)
    send("digest", digest)
# endregion


# Reset demo: forget the tickets and refunds. Maitento keeps its memories, reports and runs.
@app.post("/api/reset")
async def reset() -> dict[str, Any]:
    desk.update(fresh_desk())
    save()
    send("reset", {})
    return {"ok": True}


# 6. The shop API the desk's tools call. Maitento sends the shop-api-key secret in X-Api-Key (tutorial 9).
# region: shop
@app.middleware("http")
async def check_api_key(request: Request, call_next):
    if request.url.path.startswith("/shop/") and not hmac.compare_digest(request.headers.get("X-Api-Key", ""), API_KEY):
        return error("Unauthorised", 401)
    return await call_next(request)


@app.get("/shop/orders/{order_id}", response_model=None)
async def get_order(order_id: str) -> dict[str, Any] | JSONResponse:
    order = next((o for o in desk["orders"] if o["id"] == order_id), None)
    return order if order else error(f"There is no order {order_id}", 404)


class Refund(BaseModel):
    amount: float
    reason: str


@app.post("/shop/orders/{order_id}/refund", response_model=None)
async def refund_order(order_id: str, refund: Refund) -> dict[str, Any] | JSONResponse:
    order = next((o for o in desk["orders"] if o["id"] == order_id), None)
    if order is None:
        return error(f"There is no order {order_id}", 404)
    refundable = sum(item["price"] for item in order["items"]) - order["refunded"]
    if not 0 < refund.amount <= refundable:
        return error(f"You can refund between 0.01 and {refundable:.2f} {order['currency']}", 400)
    order["refunded"] += refund.amount
    save()
    print(f"Refunded {refund.amount} {order['currency']} on {order_id}: {refund.reason}")
    return {"orderId": order_id, "refunded": refund.amount, "totalRefunded": order["refunded"],
            "currency": order["currency"]}


# The nightly-digest app asks for one day's tickets.
@app.get("/shop/tickets/{date}")
async def day_of_tickets(date: str) -> dict[str, Any]:
    day = [t for t in desk["tickets"] if t["created"].startswith(date)]
    return {"date": date, "tickets": [
        {"id": t["id"], "customer": t["customer"], "category": (t["triage"] or {}).get("category"),
         "urgency": (t["triage"] or {}).get("urgency"), "status": t["status"]} for t in day]}
# endregion


# Everything else is the page, from ../web. Mounted last, so the routes above come first.
app.mount("/", StaticFiles(directory="../web", html=True))
