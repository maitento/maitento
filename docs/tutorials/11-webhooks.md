---
title: 11. Know when it's done
description: Have Maitento call your server whenever a run changes, check that each call is really from Maitento, and see what happens when your server fails.
sidebar:
  order: 11
---

# 11. Know when it's done

A backend shouldn't sit waiting for runs. Register a **webhook**, and Maitento calls your server whenever a run
changes: when it starts, when it needs a person, when it finishes. You build a small receiver that checks each call
really came from Maitento, then break it on purpose to see what Maitento does when your server says no. If your code
can't take calls from the internet, [tutorial 12](12-live-events.md) gets the same news over a connection your code
opens instead.

> **You'll learn**
>
> - how to register a webhook for a kind of run
> - how to check a delivery's signature, so you know it came from Maitento and isn't an old one sent again
> - why deliveries can repeat or skip states, and how to handle it
> - what Maitento does when your receiver fails, and where to see every delivery
>
> **New concepts:** [webhooks](../concepts/runs-and-events.md#3-get-called-back-webhooks)
>
> **Builds on:** [9. Call your code](09-call-your-code.md), for a server that Maitento can reach
>
> **Time:** ~20 min · **Cost:** under $0.01 on DeepSeek · **Needs:** a public address for your laptop, such as
> `cloudflared tunnel --url http://localhost:3001`

## 1. The receiver

Maitento sends a `PUT` with the run's latest state as the body, and four headers: `X-MT-WebHook-Type` (here
`InteractionProcess`), `X-MT-WebHook-AssociatedId` (the run's id), `X-MT-WebHook-Timestamp` (when Maitento sent it)
and `X-MT-WebHook-Signature`. The signature is made from the body, the timestamp and the secret you register the
webhook with. The secret itself is never sent. The SDKs check the signature and read the run for you:

<!-- tabs -->
<!-- snippet: examples/11-webhooks/typescript/receiver.ts -->
```ts title="TypeScript"
// Receives Maitento webhooks: Maitento PUTs the latest state of a run every time it changes.
import express from "express";
import { parseWebhook, verifyWebhook } from "@maitento/sdk";

const secret = process.env.WEBHOOK_SECRET;
if (!secret) throw new Error("Set WEBHOOK_SECRET to the secret you registered the webhook with.");

const finished = new Set(["Finished", "Error", "Killed"]);
const latest = new Map<string, number>(); // run id -> dateUpdated of the newest delivery we have seen

const app = express();
// Keep the body as the bytes Maitento sent: the signature covers exactly those. A run's full state can be large, so
// allow big bodies.
app.use(express.raw({ type: "application/json", limit: "50mb" }));

app.put("/maitento/webhook", async (req, res) => {
  // Every delivery is signed with your secret. verifyWebhook checks the signature against the raw body, and that the
  // delivery was signed in the last 5 minutes.
  const body = req.body as Buffer;
  if (!(await verifyWebhook(req.headers, body, secret))) {
    console.log("401: a delivery without a valid signature");
    res.sendStatus(401);
    return;
  }

  const delivery = parseWebhook(req.headers, body);
  if (delivery.type !== "InteractionProcess") {
    res.sendStatus(204);
    return;
  }
  const run = delivery.entity;

  // Deliveries can arrive more than once and out of order: keep only the newest state of each run.
  const updated = new Date(run.dateUpdated).getTime();
  const seen = latest.get(run.id);
  if (seen !== undefined && seen >= updated) {
    res.sendStatus(204);
    return;
  }
  latest.set(run.id, updated);

  console.log(`${delivery.type} ${run.id} is now ${run.status}`);
  if (finished.has(run.status) && run.output) console.log(`  output: ${run.output}`);

  // Answer quickly: Maitento waits up to 100 seconds, then tries again later.
  res.sendStatus(204);
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Webhook receiver listening on http://localhost:${port}/maitento/webhook`));
```
<!-- /snippet -->
<!-- snippet: examples/11-webhooks/python/receiver.py -->
```python title="Python"
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
```
<!-- /snippet -->
<!-- snippet: examples/11-webhooks/csharp/WebhookReceiver/Program.cs -->
```csharp title="C#"
// Receives Maitento webhooks: Maitento PUTs the latest state of a run every time it changes.
using System.Collections.Concurrent;
using Maitento.Entities.Interactions;
using Maitento.Sdk.Webhooks;

var secret = Environment.GetEnvironmentVariable("WEBHOOK_SECRET")
    ?? throw new InvalidOperationException("Set WEBHOOK_SECRET to the secret you registered the webhook with.");

InteractionProcessStatus[] finished = [InteractionProcessStatus.Finished, InteractionProcessStatus.Error, InteractionProcessStatus.Killed];
var latest = new ConcurrentDictionary<Guid, DateTime>(); // run id -> dateUpdated of the newest delivery we have seen

var app = WebApplication.Create(args);

app.MapPut("/maitento/webhook", async (HttpRequest request) =>
{
    // Every delivery is signed with your secret. Verify checks the signature against the body, exactly as it
    // arrived, and that the delivery was signed in the last 5 minutes. Read the body once, for both.
    using var reader = new StreamReader(request.Body);
    var body = await reader.ReadToEndAsync();
    if (!MaitentoWebhooks.Verify(name => request.Headers[name], body, secret))
    {
        Console.WriteLine("401: a delivery without a valid signature");
        return Results.Unauthorized();
    }

    var delivery = MaitentoWebhooks.Parse(name => request.Headers[name], body);
    if (delivery.Entity is not InteractionProcess run)
        return Results.NoContent();

    // Deliveries can arrive more than once and out of order: keep only the newest state of each run.
    if (latest.TryGetValue(run.Id, out var seen) && seen >= run.DateUpdated)
        return Results.NoContent();
    latest[run.Id] = run.DateUpdated;

    Console.WriteLine($"{delivery.Type} {run.Id} is now {run.Status}");
    if (finished.Contains(run.Status) && run.Output != null)
        Console.WriteLine($"  output: {run.Output}");

    // Answer quickly: Maitento waits up to 100 seconds, then tries again later.
    return Results.NoContent();
});

app.Run($"http://localhost:{Environment.GetEnvironmentVariable("PORT") ?? "3001"}");
```
<!-- /snippet -->
<!-- /tabs -->

- **Check the signature first.** Only Maitento and you know the secret, so only Maitento can make a signature that
  matches. Someone who sees one delivery, in a log or on the way, can't make another, because the secret isn't in it.
  The SDKs compare signatures in constant time, so the answer can't be guessed from timing.
- **Check it against the raw body.** The signature covers the body's exact bytes. If anything parses the JSON first
  and turns it back into text, the spacing or order can change, and the signature no longer matches. That's why the
  TypeScript receiver reads the body with `express.raw`, not `express.json`, and why the Python and C# receivers read
  the body once and use it to verify and to parse.
- **The timestamp stops replays.** It's signed with the body, so it can't be changed. A delivery whose timestamp is
  more than 5 minutes from your clock is refused, so a delivery someone recorded can't be sent to you again later.
  Every try is signed afresh, so a retry still passes.
- **Use an `https` address.** The signature proves who sent a delivery, but the body is the whole run: `https` stops
  anyone reading it on the way.
- **Keep the newest state of each run.** A delivery can arrive twice, and two can arrive out of order. Each carries
  the whole run, so keep the one with the latest `dateUpdated`.
- **Answer quickly.** Maitento waits up to 100 seconds. Do slow work after you've answered.

Pick a long random secret, and start the receiver on port 3001:

<!-- tabs -->
```bash title="TypeScript"
export WEBHOOK_SECRET="another-long-random-value"
cd examples/11-webhooks/typescript && npm install && node receiver.ts
```
```bash title="Python"
export WEBHOOK_SECRET="another-long-random-value"
cd examples/11-webhooks/python && pip install -r requirements.txt && uvicorn receiver:app --port 3001
```
```bash title="C#"
export WEBHOOK_SECRET="another-long-random-value"
cd examples/11-webhooks/csharp/WebhookReceiver && dotnet run
```
<!-- /tabs -->

**Done when:** it prints `Webhook receiver listening on http://localhost:3001/maitento/webhook` (Python: uvicorn's
`Uvicorn running on http://127.0.0.1:3001`), and `curl -X PUT http://localhost:3001/maitento/webhook` makes it print
`401: a delivery without a valid signature`.

## 2. Make it reachable

In another terminal, give the receiver a public address, as in [tutorial 9](09-call-your-code.md#2-make-it-reachable):

```bash
cloudflared tunnel --url http://localhost:3001
```

Your webhook's address is the tunnel's address plus `/maitento/webhook`. Keep it, and the secret, in that terminal:

```bash
export WEBHOOK_URL="https://quiet-forest-1234.trycloudflare.com/maitento/webhook"
export WEBHOOK_SECRET="another-long-random-value"
```

**Done when:** `curl -X PUT "$WEBHOOK_URL"` also makes the receiver print the `401` line.

## 3. Register it

<!-- tabs -->
<!-- snippet: examples/11-webhooks/typescript/register.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

// Where Maitento should send interaction updates, and the secret it signs each one with.
const url = process.env.WEBHOOK_URL;
const secret = process.env.WEBHOOK_SECRET;
if (!url || !secret) throw new Error("Set WEBHOOK_URL (your receiver's public address) and WEBHOOK_SECRET first.");

const mt = new Maitento();
const hook = await mt.webhooks.create({ type: "InteractionProcess", url, secret });
console.log(`Webhook ${hook.id} registered: interaction updates will be sent to ${url}`);
```
<!-- /snippet -->
<!-- snippet: examples/11-webhooks/python/register.py -->
```python title="Python"
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
```
<!-- /snippet -->
<!-- snippet: examples/11-webhooks/csharp/register.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Entities.WebHooks;
using Maitento.Sdk;

// Where Maitento should send interaction updates, and the secret it signs each one with.
var url = Environment.GetEnvironmentVariable("WEBHOOK_URL");
var secret = Environment.GetEnvironmentVariable("WEBHOOK_SECRET");
if (string.IsNullOrEmpty(url) || string.IsNullOrEmpty(secret))
    throw new InvalidOperationException("Set WEBHOOK_URL (your receiver's public address) and WEBHOOK_SECRET first.");

await using var mt = MaitentoClient.CreateFromEnvironment();
var hook = await mt.WebHooks.CreateAsync(WebHookType.InteractionProcess, url, secret, headers: []);
Console.WriteLine($"Webhook {hook.Id} registered: interaction updates will be sent to {url}");
```
<!-- /snippet -->
```bash title="CLI"
mt webhook-set -t InteractionProcess -u "$WEBHOOK_URL" -s "$WEBHOOK_SECRET"
```
<!-- /tabs -->

**Done when:** it prints `Webhook <id> registered: interaction updates will be sent to …`, and the portal's
**Webhooks** page lists it.

A webhook is for one kind of run: `InteractionProcess` here. The others are `AppProcess`, `CapsuleProcess`,
`CodePipelineProcess` and `IngestedFile` (a document a knowledge base finished reading). It belongs to your
**tenant**: it hears about every run of that kind, including ones other people start, and each delivery carries the
whole run, conversation and all. Treat what your receiver gets as you would your own data.

## 4. Run something

This tutorial's project has a small interaction to run:

<!-- snippet: examples/11-webhooks/maitento/interactions/one-shot/fun-fact.mtr -->
```hcl title="maitento/interactions/one-shot/fun-fact.mtr"
// Something quick to run, so your receiver has a run to hear about.
agent = {
  name = "FactTeller"
  agent = @ref("fact-teller")
}
task = "Tell me one surprising fact about %%topic%%."
inputs.prompts = [
  {
    name = "topic"
    description = "What the fact is about"
    required = true
  }
]
```
<!-- /snippet -->

<!-- tabs -->
<!-- snippet: examples/11-webhooks/typescript/run.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

// Deploys a small interaction and runs it. Your receiver hears about the run as it changes.
const mt = new Maitento();
await mt.deploy("../maitento");

const run = await mt.interactions.run("fun-fact", { inputs: { topic: "octopuses" } });
console.log(`Run ${run.id} ended ${run.status}: ${run.output}`);
```
<!-- /snippet -->
<!-- snippet: examples/11-webhooks/python/run.py -->
```python title="Python"
from maitento import Maitento

# Deploys a small interaction and runs it. Your receiver hears about the run as it changes.
mt = Maitento()
mt.deploy("../maitento")

run = mt.interactions.run("fun-fact", inputs={"topic": "octopuses"})
print(f"Run {run.id} ended {run.status}: {run.output}")
```
<!-- /snippet -->
<!-- snippet: examples/11-webhooks/csharp/run.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

// Deploys a small interaction and runs it. Your receiver hears about the run as it changes.
await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

var run = await mt.Interactions.RunAsync("fun-fact", new Dictionary<string, string> { ["topic"] = "octopuses" });
Console.WriteLine($"Run {run.Id} ended {run.Status}: {run.Output}");
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt interaction-run fun-fact --input-topic octopuses
```
<!-- /tabs -->

```text
Run 50116def-d9fa-44e7-b209-7897bbf657ac ended Finished: One surprising fact about octopuses is that they have three hearts and blue blood.
```

Your receiver prints:

```text
InteractionProcess 50116def-d9fa-44e7-b209-7897bbf657ac is now Finished
  output: One surprising fact about octopuses is that they have three hearts and blue blood.
```

**Done when:** the receiver prints the same run id as the script, with `Finished` and the output.

The run also went through `New` and `Running`, but it took a second, and changes in quick succession are merged: you
were sent only its latest state. A run's final state is always sent. A longer run, like tutorial 10's refund, arrives
as `Running`, then `PendingApproval`, and so on.

## 5. The delivery log

Maitento keeps a log of what it sent to each webhook: delivered updates for 24 hours, and ones it gave up on for 7
days. This script reads the log of the webhook registered for `WEBHOOK_URL`:

<!-- tabs -->
<!-- snippet: examples/11-webhooks/typescript/deliveries.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

// The delivery log of the webhook you registered: one entry per update sent, newest first.
const url = process.env.WEBHOOK_URL;
if (!url) throw new Error("Set WEBHOOK_URL to the address you registered.");

const mt = new Maitento();
const hook = (await mt.webhooks.list()).find((h) => h.url === url);
if (!hook) throw new Error(`No webhook is registered for ${url}: run register first.`);

for (const d of await mt.webhooks.deliveries(hook.id, { limit: 5 })) {
  const state = d.isSent ? "delivered" : d.isPermanentFailure ? "given up" : `next try ${d.nextAttemptTime.toISOString()}`;
  console.log(`run ${d.associatedId}: ${d.numberAttempts} attempt(s), ${state}`);
  if (d.failureDetails) console.log(`  ${d.failureDetails}`);
}
```
<!-- /snippet -->
<!-- snippet: examples/11-webhooks/python/deliveries.py -->
```python title="Python"
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
```
<!-- /snippet -->
<!-- snippet: examples/11-webhooks/csharp/deliveries.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

// The delivery log of the webhook you registered: one entry per update sent, newest first.
var url = Environment.GetEnvironmentVariable("WEBHOOK_URL");
if (string.IsNullOrEmpty(url))
    throw new InvalidOperationException("Set WEBHOOK_URL to the address you registered.");

await using var mt = MaitentoClient.CreateFromEnvironment();
var hook = (await mt.WebHooks.GetAllAsync()).FirstOrDefault(h => h.Url == url)
    ?? throw new InvalidOperationException($"No webhook is registered for {url}: run register first.");

foreach (var d in await mt.WebHooks.GetDeliveriesAsync(hook.Id, limit: 5) ?? [])
{
    var state = d.IsSent ? "delivered" : d.IsPermanentFailure ? "given up" : $"next try {d.NextAttemptTime:O}";
    Console.WriteLine($"run {d.AssociatedId}: {d.NumberAttempts} attempt(s), {state}");
    if (d.FailureDetails != null) Console.WriteLine($"  {d.FailureDetails}");
}
```
<!-- /snippet -->
```bash title="CLI"
mt webhook-delivery-list <webhook id> --limit 5
```
```bash title="curl"
curl "https://api.maitento.com/web-hooks/by-id/<webhook id>/deliveries?limit=5" -H "Authorization: $MAITENTO_AUTH"
```
<!-- /tabs -->

```text
run 50116def-d9fa-44e7-b209-7897bbf657ac: 1 attempt(s), delivered
```

The portal shows the same log: **Webhooks**, then the webhook, then **Delivery log**.

## 6. Break it on purpose: the wrong secret

Stop the receiver with Ctrl+C, and start it again with a secret that isn't the one you registered:

<!-- tabs -->
```bash title="TypeScript"
WEBHOOK_SECRET="not-the-registered-secret" node receiver.ts
```
```bash title="Python"
WEBHOOK_SECRET="not-the-registered-secret" uvicorn receiver:app --port 3001
```
```bash title="C#"
WEBHOOK_SECRET="not-the-registered-secret" dotnet run
```
<!-- /tabs -->

Run `fun-fact` again. The run finishes as before, but the signature your receiver works out with the wrong secret
doesn't match the one Maitento sent, so it turns the delivery away:

```text
401: a delivery without a valid signature
```

The delivery log says what happened, and when Maitento will try again:

```text
run 8a0ce522-3f63-43ca-aff0-8241c5615ac7: 1 attempt(s), next try 2026-10-26T20:07:41.640Z
  Unhandled exception
System.Net.Http.HttpRequestException: Response status code does not indicate success: 401 (Unauthorized).
```

Run the script again over the next minutes, and watch Maitento try again, at longer and longer gaps. The first three
tries come within seconds of each other, in case the failure was a blip; then Maitento waits 2, 4 and 8 minutes. After
the sixth try, about 14 minutes after the first, Maitento gives up on that update:

```text
run 8a0ce522-3f63-43ca-aff0-8241c5615ac7: 6 attempt(s), given up
  Unhandled exception
System.Net.Http.HttpRequestException: Response status code does not indicate success: 401 (Unauthorized).
```

An update that's given up is never sent again, but nothing about the run is lost: its final state is still there to
read, with `interactionRuns.get` or `GET /interactions/processes/by-id/{id}`. After an outage, read the runs you care
about.

Now put it right before Maitento gives up: restart the receiver with the registered secret. (If it has given up
already, break it again and run `fun-fact` once more.) The next try is delivered, and the receiver prints the run's
final state, a couple of minutes late but complete:

```text
InteractionProcess d4a18f06-3163-4855-9d8b-304da90ef568 is now Finished
  output: One surprising fact about octopuses is that they have three hearts—two that pump blood to the gills and one that pumps it to the rest of the body—and the latter stops beating when they swim, which is why they prefer crawling.
```

```text
run d4a18f06-3163-4855-9d8b-304da90ef568: 2 attempt(s), delivered
```

**Done when:** the log shows the run delivered after more than one attempt.

## If it didn't work

- **The receiver prints nothing, and the log says `Connection refused` or `Name or service not known`.** Maitento
  can't reach your receiver: the tunnel has stopped, or isn't pointed at port 3001. A quick tunnel gets a new
  address every time it starts, so register the new one (see the last point).
- **Registering fails with `… [api:webhooks:address-blocked]`, or the log says `Maitento won't deliver to
  localhost: the address isn't on the public internet`.** The webhook points at `localhost`, a private address or a
  name on your own network, and Maitento only delivers to addresses on the public internet. Register the tunnel's
  address.
- **The log says `404 (Not Found)`.** The address you registered doesn't end in `/maitento/webhook`.
- **The log says `301 (Moved Permanently)` or another redirect.** Maitento doesn't follow redirects, so a delivery
  never goes anywhere you didn't register. Register the address the redirect points at.
- **Every delivery is a `401`.** The receiver's `WEBHOOK_SECRET` isn't the one you registered. See step 6.
- **Every delivery is a `401`, and the secret is right.** Something changed the body before you verified it. The
  signature covers the bytes Maitento sent, and JSON that's parsed and written out again can come out different. Look
  for an `express.json()`, or anything else that reads the body as JSON, ahead of the webhook route, and verify the raw
  body, as the receivers here do.
- **Still a `401`, with the right secret and the raw body.** Your computer's clock is more than 5 minutes out, so
  every delivery looks too old (or too new) to be fresh. Set the clock automatically, from the internet.
- **Registering again fails with `WebHook with URL '…' and type 'InteractionProcess' already exists`.** It's already
  registered: use it, or delete it first.
- **Your receiver prints runs you didn't start.** A webhook hears about every run of its kind in your tenant. Filter
  on what you care about, such as the interaction (`run.interaction.id`).
- **A new address.** Delete the webhook and register the new address, or update it with `webhooks.update`. Moving it
  to a new address needs the secret again, so only someone who knows it can send your deliveries somewhere else.

When you're done, delete the webhook, or Maitento keeps sending to an address that no longer answers:
`mt webhook-delete --id <webhook id>`, `webhooks.delete(id)` in the SDKs, or **Delete** on the portal's **Webhooks**
page.

## All the files

<!-- project: examples/11-webhooks -->
**On GitHub:** [`examples/11-webhooks`](https://github.com/maitento/maitento/tree/main/examples/11-webhooks) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/11-webhooks/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/11-webhooks/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/11-webhooks/csharp)

<details>
<summary>All the files in this project (2)</summary>

<!-- tabs: files -->
**`maitento/agents/fact-teller.mtr`**
```hcl title="maitento/agents/fact-teller.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You tell people surprising, true facts. Answer in one sentence."
summary = "Tells one surprising fact"
```

**`maitento/interactions/one-shot/fun-fact.mtr`**
```hcl title="maitento/interactions/one-shot/fun-fact.mtr"
// Something quick to run, so your receiver has a run to hear about.
agent = {
  name = "FactTeller"
  agent = @ref("fact-teller")
}
task = "Tell me one surprising fact about %%topic%%."
inputs.prompts = [
  {
    name = "topic"
    description = "What the fact is about"
    required = true
  }
]
```
<!-- /tabs -->

</details>

<!-- /project -->

## Review

You built a receiver that Maitento calls whenever a run changes. It checks the signature, keeps the newest state of
each run, and answers fast. You saw a failed delivery retried, and the log that records every one.

- **[Webhook](../concepts/runs-and-events.md#3-get-called-back-webhooks):** an address and a secret, registered for
  one kind of run in your tenant. Maitento `PUT`s the run's whole state there whenever it changes.
- **The signature** proves that a delivery came from Maitento and wasn't changed, and its timestamp stops an old one
  being sent again. Check it against the raw body, before you parse it, and use `https`.
- **Repeats and merges:** a delivery can come twice, and quick changes are merged. The final state always arrives.
  Keep the newest `dateUpdated`.
- **Failures** (anything but a 2xx, or no answer within 100 seconds) are tried again: six tries over about 14
  minutes, then the update is given up. The **delivery log** shows each one.

**Challenge:** in tutorial 10, someone had to watch a terminal to approve a refund. Make your receiver tell you
instead: when a run is `PendingApproval`, print which tool it wants to call, with what arguments, and the command that
approves it. Run tutorial 10's refund (`request` from its solution starts one without waiting) and watch your
receiver.

**Done when:** your receiver prints the refund the agent wants, and approving it from the CLI refunds the order.

The solution is in [`examples/11-webhooks/solution`](../../examples/11-webhooks/solution/): the receiver, with the
approval added, in all three languages.

```text
InteractionProcess 83cb413d-3380-4da9-9d95-35d5f890be6e is now Running
InteractionProcess 83cb413d-3380-4da9-9d95-35d5f890be6e is now PendingApproval
  needs approval: Support wants to call refund-order with {"request":{"amount":5,"reason":"Tea sampler was missing two of its teas"},"additionalInputs":{"path.orderId":"A-1001"}}
  approve with: mt interaction-approve 83cb413d-3380-4da9-9d95-35d5f890be6e
```

**Next:** [12. Live events](12-live-events.md) gets the same news without a public address: your code opens one
connection to Maitento, and every change arrives over it as it happens.
