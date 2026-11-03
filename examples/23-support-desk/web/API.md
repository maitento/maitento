# The support desk's API

Every backend (`typescript/`, `python/`, `csharp/`) serves this folder as it is, and answers the same requests, so the
page works with any of them. Bodies are JSON. An error is `{"error": "what went wrong"}` with a 4xx or 5xx status.

## For the page

| Request | Answer |
|---|---|
| `GET /api/status` | `{"ok": true, "error": null}`, or `ok: false` and why: Maitento can't be reached, or setup hasn't run |
| `GET /api/tickets` | `{"tickets": [Ticket]}`, newest first |
| `POST /api/tickets` `{"customer", "email", "subject"?, "message"}` | `201` and the new `Ticket` (status `new`). Triage and the reply follow on their own |
| `POST /api/tickets/{id}/approve` `{}` | the `Ticket`. Approves the refund its run is waiting on. `409` when it isn't waiting |
| `POST /api/tickets/{id}/reject` `{"reason"}` | the `Ticket`. Rejects it, and the agent is told the reason |
| `GET /api/tickets/{id}/memory` | `{"threads": [{"content", "kind", "created"}]}`: what Maitento remembers about the ticket's customer |
| `GET /api/digest` | `{"running", "error", "report", "counts"}`: the latest nightly report (Markdown) and its numbers, or nulls |
| `POST /api/digest` `{}` | `202` `{"running": true, "error": null}`: runs the nightly digest now |
| `GET /api/scenarios` | `{"scenarios": [...]}`, the sample tickets in `data/scenarios.json` |
| `POST /api/reset` `{}` | `{"ok": true}`: deletes every ticket and restores `data/orders.json`. Maitento keeps its memories |
| `GET /api/events` | Server-Sent Events, below |

A `Ticket`:

```json
{
  "id": "T-1001", "customer": "Sam Lee", "email": "sam.lee@example.com", "subject": "Grinder handle snapped",
  "message": "Hi, my order A-1001 arrived yesterday but…", "created": "2026-10-26T19:14:28.858Z",
  "status": "approval",
  "triage": { "category": "damaged", "urgency": "normal", "orderId": "A-1001", "summary": "…" },
  "runId": "e7d36cf3-…", "loomId": "2c900c9e-…", "updated": "2026-10-26T19:14:37.824Z",
  "approval": { "id": "8f935313-…", "tool": "issue-refund", "arguments": "{\"request\":{\"amount\":42,…}}" },
  "decision": null,
  "steps": [{ "id": "call_00_…", "tool": "find-order", "input": "{…}", "output": "{…}", "error": false, "rejection": null }],
  "reply": null, "error": null
}
```

- `status`: `new` → `triaged` → `drafting` → `approval` (a refund waits for a person) → `replied`, or `rejected` when
  the refund was rejected, or `failed`.
- `triage`: the `triage-ticket` interaction's typed answer, `null` until it has one.
- `runId`: the `draft-reply` run. `loomId`: the customer's memory, which that run woke up with.
- `approval`: the tool call the run waits on: `tool`, and `arguments` as the model wrote them (JSON text).
- `decision`: what the person decided: `{"approved": false, "reason": "…"}`.
- `steps`: every tool call of the run, in order, with its `input` and `output` as text. `output` is `null` until the
  tool has answered; `rejection` holds the reason a person gave for rejecting it.
- `reply`: the drafted email once the run has finished; `error`: why it failed.

### Events

`GET /api/events` stays open and sends:

| Event | Data | When |
|---|---|---|
| `ticket` | the whole `Ticket` | it was filed, or anything about it changed |
| `digest` | `{"running", "error"}` | a digest run started or ended. Read `GET /api/digest` for the report |
| `reset` | `{}` | the demo was reset |
| `ping` | `{}` | every 15 seconds, so proxies keep the stream open |

## For Maitento

| Request | Who calls it |
|---|---|
| `PUT /maitento/webhook` | Maitento, whenever an interaction run or an app run changes. Signed with the webhook secret, and checked against the raw body |
| `GET /shop/orders/{orderId}` | the `find-order` tool |
| `POST /shop/orders/{orderId}/refund` `{"amount", "reason"}` | the `issue-refund` tool, once a person approves |
| `GET /shop/tickets/{date}` | the `list-tickets` tool, from the `nightly-digest` app |

Everything under `/shop` needs the `X-Api-Key` header: the `shop-api-key` secret, which Maitento adds to each call.
