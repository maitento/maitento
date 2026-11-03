---
title: 9. Call your code
description: Give an agent a tool that calls your own server, with your server's key kept in Maitento as a secret.
sidebar:
  order: 9
---

# 9. Call your code

Build a support agent for an online shop that looks orders up on **your** server. Your server answers only calls that
carry its key, and that key lives in Maitento as a **secret**: it's never in a project file, and the model never sees
it. This is how you connect agents to your own systems: your API, your database, your business rules.

> **You'll learn**
>
> - how to point a tool at your own API
> - how to keep your API key in a secret that Maitento sends in a header
> - what the agent does when your server turns it away
> - how each run can choose which key to send, so one agent can serve several shops
>
> **New concepts:** [secrets](../concepts/secrets.md) ·
> [tool authentication](../concepts/tools.md#when-the-agent-calls-your-server)
>
> **Builds on:** [8. Your first tool](08-first-tool.md)
>
> **Time:** ~25 min · **Cost:** under $0.01 on DeepSeek · **Needs:** a public address for your laptop. A free
> Cloudflare quick tunnel works, with no account: `cloudflared tunnel --url http://localhost:3000`

## 1. Run the orders API

This small API is what the agent will call. It keeps three orders in memory, for two shops, and answers only calls
whose `X-Api-Key` header holds a shop's key. Each shop sees only its own orders. You need only the first shop until the
last part of this tutorial, and the refund endpoint is for [tutorial 10](10-approvals.md).

<!-- tabs -->
<!-- snippet: examples/09-call-your-code/typescript/server.ts -->
```ts title="TypeScript"
// A tiny orders API. Maitento calls it for the agent's get-order tool, and for refund-order in tutorial 10.
import { timingSafeEqual } from "node:crypto";
import express from "express";

const apiKey = process.env.ORDERS_API_KEY;
if (!apiKey) throw new Error("Set ORDERS_API_KEY to the value you stored in the orders-api-key secret.");

// Each shop has its own key, and sees only its own orders. Shop 2 is for the end of tutorial 9: setting
// SECOND_SHOP_API_KEY opens it.
const shopKeys = new Map<string, string>([["shop-1", apiKey]]);
if (process.env.SECOND_SHOP_API_KEY) shopKeys.set("shop-2", process.env.SECOND_SHOP_API_KEY);

type Order = {
  id: string; shop: string; customer: string; items: string[];
  total: number; currency: string; status: string; refunded: number;
};

const orders = new Map<string, Order>([
  ["A-1001", { id: "A-1001", shop: "shop-1", customer: "Sam Lee", items: ["Blue mug", "Tea sampler"], total: 34.5, currency: "GBP", status: "delivered", refunded: 0 }],
  ["A-1002", { id: "A-1002", shop: "shop-1", customer: "Ana Silva", items: ["Desk lamp"], total: 59.9, currency: "GBP", status: "in transit", refunded: 0 }],
  ["B-2001", { id: "B-2001", shop: "shop-2", customer: "Kai Moreno", items: ["Oak bookshelf"], total: 189, currency: "EUR", status: "in transit", refunded: 0 }],
]);

// The shop whose key a call sends in X-Api-Key, compared in constant time so it can't be guessed from timing.
function shopFor(sentKey: string | undefined): string | undefined {
  const sent = Buffer.from(sentKey ?? "");
  for (const [shop, key] of shopKeys) {
    const expected = Buffer.from(key);
    if (sent.length === expected.length && timingSafeEqual(sent, expected)) return shop;
  }
  return undefined;
}

// The order, if it exists and belongs to the shop that asks.
function findOrder(orderId: string, shop: string | undefined): Order | undefined {
  const order = orders.get(orderId);
  return order && order.shop === shop ? order : undefined;
}

const app = express();
app.use(express.json());

// Maitento sends the secret's value in the X-Api-Key header. Anything else is turned away.
app.use((req, res, next) => {
  if (!shopFor(req.get("X-Api-Key"))) {
    console.log("401: a call without a known X-Api-Key");
    res.status(401).json({ error: "Unauthorised" });
    return;
  }
  next();
});

app.get("/orders/:orderId", (req, res) => {
  const shop = shopFor(req.get("X-Api-Key"));
  console.log(`${shop}: GET /orders/${req.params.orderId}`);
  const order = findOrder(req.params.orderId, shop);
  if (!order) {
    res.status(404).json({ error: `There is no order ${req.params.orderId}` });
    return;
  }
  res.json(order);
});

app.post("/orders/:orderId/refund", (req, res) => {
  const shop = shopFor(req.get("X-Api-Key"));
  console.log(`${shop}: POST /orders/${req.params.orderId}/refund`);
  const order = findOrder(req.params.orderId, shop);
  if (!order) {
    res.status(404).json({ error: `There is no order ${req.params.orderId}` });
    return;
  }
  const { amount, reason } = req.body as { amount: number; reason: string };
  const refundable = order.total - order.refunded;
  if (amount <= 0 || amount > refundable) {
    res.status(400).json({ error: `You can refund between 0.01 and ${refundable.toFixed(2)} ${order.currency}` });
    return;
  }
  order.refunded += amount;
  console.log(`Refunded ${amount} ${order.currency} on ${order.id}: ${reason}`);
  res.json({ orderId: order.id, refunded: amount, totalRefunded: order.refunded });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Orders API listening on http://localhost:${port}`));
```
<!-- /snippet -->
<!-- snippet: examples/09-call-your-code/python/server.py -->
```python title="Python"
# A tiny orders API. Maitento calls it for the agent's get-order tool, and for refund-order in tutorial 10.
# Run it with: uvicorn server:app --port 3000
import hmac
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

API_KEY = os.environ.get("ORDERS_API_KEY")
if not API_KEY:
    raise RuntimeError("Set ORDERS_API_KEY to the value you stored in the orders-api-key secret.")

# Each shop has its own key, and sees only its own orders. Shop 2 is for the end of tutorial 9: setting
# SECOND_SHOP_API_KEY opens it.
SHOP_KEYS = {"shop-1": API_KEY}
if os.environ.get("SECOND_SHOP_API_KEY"):
    SHOP_KEYS["shop-2"] = os.environ["SECOND_SHOP_API_KEY"]

orders = {
    "A-1001": {"id": "A-1001", "shop": "shop-1", "customer": "Sam Lee", "items": ["Blue mug", "Tea sampler"],
               "total": 34.5, "currency": "GBP", "status": "delivered", "refunded": 0.0},
    "A-1002": {"id": "A-1002", "shop": "shop-1", "customer": "Ana Silva", "items": ["Desk lamp"],
               "total": 59.9, "currency": "GBP", "status": "in transit", "refunded": 0.0},
    "B-2001": {"id": "B-2001", "shop": "shop-2", "customer": "Kai Moreno", "items": ["Oak bookshelf"],
               "total": 189.0, "currency": "EUR", "status": "in transit", "refunded": 0.0},
}

app = FastAPI()


def shop_for(sent_key: str) -> str | None:
    """The shop whose key a call sends in X-Api-Key, compared in constant time so it can't be guessed from timing."""
    for shop, key in SHOP_KEYS.items():
        if hmac.compare_digest(sent_key, key):
            return shop
    return None


# Maitento sends the secret's value in the X-Api-Key header. Anything else is turned away.
@app.middleware("http")
async def check_api_key(request: Request, call_next):
    shop = shop_for(request.headers.get("X-Api-Key", ""))
    if shop is None:
        print("401: a call without a known X-Api-Key")
        return JSONResponse({"error": "Unauthorised"}, status_code=401)
    request.state.shop = shop
    return await call_next(request)


def find_order(order_id: str, shop: str) -> dict:
    """The order, if it exists and belongs to the shop that asks."""
    order = orders.get(order_id)
    if order is None or order["shop"] != shop:
        raise HTTPException(404, f"There is no order {order_id}")
    return order


@app.get("/orders/{order_id}")
def get_order(order_id: str, request: Request):
    print(f"{request.state.shop}: GET /orders/{order_id}")
    return find_order(order_id, request.state.shop)


class Refund(BaseModel):
    amount: float
    reason: str


@app.post("/orders/{order_id}/refund")
def refund_order(order_id: str, refund: Refund, request: Request):
    print(f"{request.state.shop}: POST /orders/{order_id}/refund")
    order = find_order(order_id, request.state.shop)
    refundable = order["total"] - order["refunded"]
    if refund.amount <= 0 or refund.amount > refundable:
        raise HTTPException(400, f"You can refund between 0.01 and {refundable:.2f} {order['currency']}")
    order["refunded"] += refund.amount
    print(f"Refunded {refund.amount} {order['currency']} on {order_id}: {refund.reason}")
    return {"orderId": order_id, "refunded": refund.amount, "totalRefunded": order["refunded"]}
```
<!-- /snippet -->
<!-- snippet: examples/09-call-your-code/csharp/OrdersApi/Program.cs -->
```csharp title="C#"
// A tiny orders API. Maitento calls it for the agent's get-order tool, and for refund-order in tutorial 10.
using System.Security.Cryptography;
using System.Text;

var apiKey = Environment.GetEnvironmentVariable("ORDERS_API_KEY")
    ?? throw new InvalidOperationException("Set ORDERS_API_KEY to the value you stored in the orders-api-key secret.");

// Each shop has its own key, and sees only its own orders. Shop 2 is for the end of tutorial 9: setting
// SECOND_SHOP_API_KEY opens it.
var shopKeys = new Dictionary<string, string> { ["shop-1"] = apiKey };
if (Environment.GetEnvironmentVariable("SECOND_SHOP_API_KEY") is { Length: > 0 } secondShopKey)
    shopKeys["shop-2"] = secondShopKey;

var orders = new Dictionary<string, Order>
{
    ["A-1001"] = new("A-1001", "shop-1", "Sam Lee", ["Blue mug", "Tea sampler"], 34.5m, "GBP", "delivered"),
    ["A-1002"] = new("A-1002", "shop-1", "Ana Silva", ["Desk lamp"], 59.9m, "GBP", "in transit"),
    ["B-2001"] = new("B-2001", "shop-2", "Kai Moreno", ["Oak bookshelf"], 189m, "EUR", "in transit"),
};

// The shop whose key a call sends in X-Api-Key, compared in constant time so it can't be guessed from timing.
string? ShopFor(string sentKey)
{
    var sent = Encoding.UTF8.GetBytes(sentKey);
    foreach (var (shop, key) in shopKeys)
        if (CryptographicOperations.FixedTimeEquals(sent, Encoding.UTF8.GetBytes(key)))
            return shop;
    return null;
}

// The order, if it exists and belongs to the shop that asks.
Order? FindOrder(string orderId, string shop) =>
    orders.TryGetValue(orderId, out var order) && order.Shop == shop ? order : null;

var app = WebApplication.Create(args);

// Maitento sends the secret's value in the X-Api-Key header. Anything else is turned away.
app.Use(async (context, next) =>
{
    var shop = ShopFor(context.Request.Headers["X-Api-Key"].ToString());
    if (shop == null)
    {
        Console.WriteLine("401: a call without a known X-Api-Key");
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsJsonAsync(new { error = "Unauthorised" });
        return;
    }
    context.Items["shop"] = shop;
    await next();
});

app.MapGet("/orders/{orderId}", (string orderId, HttpContext context) =>
{
    var shop = (string)context.Items["shop"]!;
    Console.WriteLine($"{shop}: GET /orders/{orderId}");
    return FindOrder(orderId, shop) is { } order
        ? Results.Ok(order)
        : Results.NotFound(new { error = $"There is no order {orderId}" });
});

app.MapPost("/orders/{orderId}/refund", (string orderId, RefundRequest refund, HttpContext context) =>
{
    var shop = (string)context.Items["shop"]!;
    Console.WriteLine($"{shop}: POST /orders/{orderId}/refund");
    if (FindOrder(orderId, shop) is not { } order)
        return Results.NotFound(new { error = $"There is no order {orderId}" });

    var refundable = order.Total - order.Refunded;
    if (refund.Amount <= 0 || refund.Amount > refundable)
        return Results.BadRequest(new { error = $"You can refund between 0.01 and {refundable:0.00} {order.Currency}" });

    order.Refunded += refund.Amount;
    Console.WriteLine($"Refunded {refund.Amount} {order.Currency} on {orderId}: {refund.Reason}");
    return Results.Ok(new { orderId, refunded = refund.Amount, totalRefunded = order.Refunded });
});

app.Run($"http://localhost:{Environment.GetEnvironmentVariable("PORT") ?? "3000"}");

record Order(string Id, string Shop, string Customer, string[] Items, decimal Total, string Currency, string Status)
{
    public decimal Refunded { get; set; }
}

record RefundRequest(decimal Amount, string Reason);
```
<!-- /snippet -->
<!-- /tabs -->

Pick a long random key, and start the server on port 3000:

<!-- tabs -->
```bash title="TypeScript"
export ORDERS_API_KEY="pick-a-long-random-value"
cd examples/09-call-your-code/typescript && npm install && node server.ts
```
```bash title="Python"
export ORDERS_API_KEY="pick-a-long-random-value"
cd examples/09-call-your-code/python && pip install -r requirements.txt && uvicorn server:app --port 3000
```
```bash title="C#"
export ORDERS_API_KEY="pick-a-long-random-value"
cd examples/09-call-your-code/csharp/OrdersApi && dotnet run
```
<!-- /tabs -->

In another terminal, with the same `ORDERS_API_KEY`, ask it for an order:

```bash
curl -H "X-Api-Key: $ORDERS_API_KEY" http://localhost:3000/orders/A-1002
```

**Done when:** curl prints order A-1002 as JSON, and the server prints `shop-1: GET /orders/A-1002`. Without the
header, curl gets `{"error":"Unauthorised"}`.

## 2. Make it reachable

Maitento calls your server from the internet, so `localhost` isn't enough: it only calls addresses on the public
internet, never `localhost`, a private network or an internal name. For trying things out, a quick tunnel gives your
laptop a public `https` address:

```bash
cloudflared tunnel --url http://localhost:3000
# … Your quick Tunnel has been created! Visit it at: https://quiet-forest-1234.trycloudflare.com
```

**Done when:** the curl from step 1 works with the tunnel's address in place of `http://localhost:3000`.

Put that address in the connector file, in place of `https://YOUR-SERVER.example.com`. `auth = "Header"` says that
calls to this endpoint need a credential in a header:

<!-- snippet: examples/09-call-your-code/maitento/connectors/open-api/orders-get.mtr -->
```hcl title="maitento/connectors/open-api/orders-get.mtr"
// Replace the host with your server's public URL (see the tutorial for a free tunnel).
method = "GET"
url = "https://YOUR-SERVER.example.com/orders/{orderId}"
description = "Looks up one order by its id"
auth = "Header"
parameters.path = [
  {
    name = "orderId"
    description = "The order id, for example A-1001"
  }
]
```
<!-- /snippet -->

## 3. The tool sends your key

The tool names the header and the **secret** whose value goes in it. The secret's value is stored in Maitento, never in
your project files, and the model never sees it, or even that there is one:

<!-- snippet: examples/09-call-your-code/maitento/external-operations/open-api/get-order.mtr -->
```hcl title="maitento/external-operations/open-api/get-order.mtr"
connector = @ref("orders-get")
// Maitento sends the secret's value in this header. Your server checks it.
auth = {
  header = "X-Api-Key"
  secret = @ref("orders-api-key")
}
guidance = "Looks up an order: its items, total, status and how much has already been refunded."
```
<!-- /snippet -->

The agent has the tool, as in tutorial 8:

<!-- snippet: examples/09-call-your-code/maitento/agents/support-agent.mtr -->
```hcl title="maitento/agents/support-agent.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a customer support agent for an online shop. Look orders up before you answer, and be precise about amounts."
summary = "Answers questions about orders"
functions = [
  {
    ref = @ref("get-order")
  }
]
```
<!-- /snippet -->

The `support` interaction passes the customer's `message` to the agent.

## 4. Store the secret and deploy

The script stores your key as the `orders-api-key` secret, then deploys. The order matters: a deploy checks that every
secret its tools name already exists.

<!-- tabs -->
<!-- snippet: examples/09-call-your-code/typescript/setup.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const apiKey = process.env.ORDERS_API_KEY;
if (!apiKey) throw new Error("Set ORDERS_API_KEY first: the same value your orders API checks.");

const mt = new Maitento();

// Stores a value as a Maitento secret, or replaces the value of the one with that name.
async function storeSecret(name: string, value: string) {
  const existing = await mt.secrets.findByName(name);
  if (existing) await mt.secrets.update(existing.id, { name, value });
  else await mt.secrets.create({ name, value });
}

// The key your orders API expects. The get-order tool sends it in the X-Api-Key header.
await storeSecret("orders-api-key", apiKey);
// The second shop's key, for the end of the tutorial.
if (process.env.SECOND_SHOP_API_KEY) await storeSecret("second-shop-api-key", process.env.SECOND_SHOP_API_KEY);

// The secret has to exist before the tools that use it are deployed.
await mt.deploy("../maitento");
console.log("Secrets stored and the support agent deployed.");
```
<!-- /snippet -->
<!-- snippet: examples/09-call-your-code/python/setup.py -->
```python title="Python"
import os
import sys

from maitento import Maitento

api_key = os.environ.get("ORDERS_API_KEY")
if not api_key:
    sys.exit("Set ORDERS_API_KEY first: the same value your orders API checks.")

mt = Maitento()


def store_secret(name: str, value: str) -> None:
    """Stores a value as a Maitento secret, or replaces the value of the one with that name."""
    existing = mt.secrets.find_by_name(name)
    if existing:
        mt.secrets.update(existing.id, name=name, value=value)
    else:
        mt.secrets.create(name, value)


# The key your orders API expects. The get-order tool sends it in the X-Api-Key header.
store_secret("orders-api-key", api_key)
# The second shop's key, for the end of the tutorial.
second_shop_key = os.environ.get("SECOND_SHOP_API_KEY")
if second_shop_key:
    store_secret("second-shop-api-key", second_shop_key)

# The secret has to exist before the tools that use it are deployed.
mt.deploy("../maitento")
print("Secrets stored and the support agent deployed.")
```
<!-- /snippet -->
<!-- snippet: examples/09-call-your-code/csharp/setup.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

var apiKey = Environment.GetEnvironmentVariable("ORDERS_API_KEY");
if (string.IsNullOrEmpty(apiKey))
    throw new InvalidOperationException("Set ORDERS_API_KEY first: the same value your orders API checks.");

await using var mt = MaitentoClient.CreateFromEnvironment();

// Stores a value as a Maitento secret, or replaces the value of the one with that name.
async Task StoreSecret(string name, string value)
{
    var existing = await mt.Secrets.GetByNameAsync(name);
    if (existing != null) await mt.Secrets.UpdateAsync(existing.Id, name, value);
    else await mt.Secrets.CreateAsync(name, value);
}

// The key your orders API expects. The get-order tool sends it in the X-Api-Key header.
await StoreSecret("orders-api-key", apiKey);
// The second shop's key, for the end of the tutorial.
if (Environment.GetEnvironmentVariable("SECOND_SHOP_API_KEY") is { Length: > 0 } secondShopKey)
    await StoreSecret("second-shop-api-key", secondShopKey);

// The secret has to exist before the tools that use it are deployed.
await mt.DeployAsync("../maitento");
Console.WriteLine("Secrets stored and the support agent deployed.");
```
<!-- /snippet -->
```bash title="CLI"
mt secret-create orders-api-key --value "$ORDERS_API_KEY"
mt deploy ./maitento
```
<!-- /tabs -->

Run it from the language's folder with `ORDERS_API_KEY` set: `node setup.ts`, `python setup.py` or
`dotnet run setup.cs`.

**Done when:** it prints `Secrets stored and the support agent deployed.` The portal's **Secrets** page lists
`orders-api-key`, without its value.

## 5. Ask about an order

<!-- tabs -->
<!-- snippet: examples/09-call-your-code/typescript/ask.ts -->
```ts title="TypeScript"
import { Maitento, transcript } from "@maitento/sdk";

const mt = new Maitento();

const message = "Hi, I ordered a desk lamp last week (order A-1002). Has it shipped yet?";
console.log(`Customer: ${message}\n`);

// The agent looks the order up on your server before it answers.
const run = await mt.interactions.run("support", { inputs: { message } });

// What the agent did: each tool call, and what your server answered.
for (const entry of transcript(run)) {
  if (entry.kind === "toolCall") console.log(`Tool call: ${entry.functionName} ${entry.argumentsJson}`);
  if (entry.kind === "toolResult") {
    const { result } = await mt.interactionRuns.toolResult(run.id, entry.sequence);
    console.log(`Tool result: ${result}`);
  }
}
console.log(`\nSupport: ${run.output}`);
```
<!-- /snippet -->
<!-- snippet: examples/09-call-your-code/python/ask.py -->
```python title="Python"
from maitento import Maitento, transcript

mt = Maitento()

message = "Hi, I ordered a desk lamp last week (order A-1002). Has it shipped yet?"
print(f"Customer: {message}\n")

# The agent looks the order up on your server before it answers.
run = mt.interactions.run("support", inputs={"message": message})

# What the agent did: each tool call, and what your server answered.
for entry in transcript(run):
    if entry.kind == "tool_call":
        print(f"Tool call: {entry.item.function_name} {entry.item.arguments_json}")
    elif entry.kind == "tool_result":
        print(f"Tool result: {mt.interaction_runs.tool_result(run.id, entry.sequence).result}")
print(f"\nSupport: {run.output}")
```
<!-- /snippet -->
<!-- snippet: examples/09-call-your-code/csharp/ask.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Interactions;
using Maitento.Sdk;
using Maitento.Sdk.Transcripts;

await using var mt = MaitentoClient.CreateFromEnvironment();

var message = "Hi, I ordered a desk lamp last week (order A-1002). Has it shipped yet?";
Console.WriteLine($"Customer: {message}\n");

// The agent looks the order up on your server before it answers.
var run = await mt.Interactions.RunAsync("support", new Dictionary<string, string> { ["message"] = message });

// What the agent did: each tool call, and what your server answered.
foreach (var entry in MaitentoTranscript.Of(run))
{
    if (entry.Item is InteractionProcessContextToolCall call)
        Console.WriteLine($"Tool call: {call.FunctionName} {call.ArgumentsJson}");
    else if (entry.Item is InteractionProcessContextToolResult)
        Console.WriteLine($"Tool result: {(await mt.InteractionProcesses.GetToolResultAsync(run.Id, entry.Sequence))?.Result}");
}
Console.WriteLine($"\nSupport: {run.Output}");
```
<!-- /snippet -->
```bash title="CLI"
mt interaction-run support --input-message "Hi, I ordered a desk lamp last week (order A-1002). Has it shipped yet?"
```
<!-- /tabs -->

```text
Customer: Hi, I ordered a desk lamp last week (order A-1002). Has it shipped yet?

Tool call: get-order {"additionalInputs":{"path.orderId":"A-1002"}}
Tool result: {"id":"A-1002","shop":"shop-1","customer":"Ana Silva","items":["Desk lamp"],"total":59.9,"currency":"GBP","status":"in transit","refunded":0}

Support: Order A-1002 (one desk lamp, total £59.90) is currently **in transit**, so it has shipped. No refunds have been issued on this order.
```

**Done when:** you see the `get-order` call for `A-1002`, your order as its result, and your server prints
`shop-1: GET /orders/A-1002`.

What happened:

1. The model saw `get-order`, described by the tool's guidance, with the connector's `orderId` path parameter as its
   only argument.
2. It called the tool for `A-1002`. Maitento sent `GET /orders/A-1002` to your server, with the secret's value in
   `X-Api-Key`.
3. Your server checked the key, answered with the order, and the agent wrote its reply from it.

## 6. Break it on purpose: the wrong key

Keys get rotated. Stop the server with Ctrl+C, and start it again with a new key that Maitento doesn't have:

<!-- tabs -->
```bash title="TypeScript"
ORDERS_API_KEY="a-new-key-maitento-does-not-have" node server.ts
```
```bash title="Python"
ORDERS_API_KEY="a-new-key-maitento-does-not-have" uvicorn server:app --port 3000
```
```bash title="C#"
ORDERS_API_KEY="a-new-key-maitento-does-not-have" dotnet run
```
<!-- /tabs -->

Ask again. Your server prints `401: a call without a known X-Api-Key`, and the script prints:

```text
Tool call: get-order {"additionalInputs":{"path.orderId":"A-1002"}}
Tool result: {"error": "Remote API returned status code: Unauthorized with response: {\"error\":\"Unauthorised\"}"}

Support: I attempted to look up order A-1002, but the order system returned an "Unauthorised" error, so I'm unable to retrieve its status at this time. …
```

- **Your server's 401 reached the agent as the tool's result**, like Open-Meteo's 400 in tutorial 8. The run
  didn't fail: the agent explained that it couldn't check the order.
- **The agent can't fix it.** It never sees the key. You fix it in Maitento: run setup again with the new
  `ORDERS_API_KEY`. Tools name the secret, not its value, so the next call sends the new value. There's nothing to
  redeploy.

Run setup with the new key, or restart the server with the old one, before you go on.

## 7. Let each run choose the key

So far the tool always sends `orders-api-key`. Now suppose your agent serves several shops, each with its own key for
the orders API. Instead of one agent per shop, the run can choose the secret: declare it on the interaction with
`inputs.functions.auth`.

Open the second shop. In both terminals, set a second key next to the first:

```bash
export SECOND_SHOP_API_KEY="another-long-random-value"
```

Then restart the server, and run setup again: it stores the second key as the `second-shop-api-key` secret, and
deploys the interaction below.

The project's second interaction is the same support desk, with one addition:

<!-- snippet: examples/09-call-your-code/maitento/interactions/one-shot/support-any-shop.mtr -->
```hcl title="maitento/interactions/one-shot/support-any-shop.mtr"
// The support desk for any shop: each run says which shop's key the get-order tool sends.
agent = {
  name = "Support"
  agent = @ref("support-agent")
}
task = "A customer writes: %%message%%"
inputs.prompts = [
  {
    name = "message"
    description = "What the customer wrote"
    required = true
  }
]
// The run passes the id of a secret, and Maitento sends that secret's value in X-Api-Key instead of the one the tool
// names. The agent never sees it.
inputs.functions.auth = [
  {
    name = "shopKey"
    description = "The id of the secret that holds the shop's API key"
    function = @ref("get-order")
    agent = @ref("support-agent")
    header = "X-Api-Key"
    required = true
  }
]
```
<!-- /snippet -->

- **`name`** is the run input, `shopKey`. Its value is the secret's **id**: not its name, and never its value.
- **`function`** and **`agent`** say which tool, and whose, as for the bindings in tutorial 8.
- **`header`** is where the value goes. It replaces the tool's own `auth` for this run.
- **`required = true`** means every run must say which shop. With `required = false`, a run that passes nothing uses
  the tool's own secret, or the input's default, `secret = @ref("…")`.

The script looks the secret up by name and passes its id:

<!-- tabs -->
<!-- snippet: examples/09-call-your-code/typescript/ask-shop.ts -->
```ts title="TypeScript"
import { Maitento, transcript } from "@maitento/sdk";

// Which shop the customer is writing to: the name of the secret holding its key.
const secretName = process.argv[2] ?? "second-shop-api-key";

const mt = new Maitento();
// A run takes the secret's id: never its value, which stays in Maitento.
const secret = await mt.secrets.getByName(secretName);

const message = "Hi, has my oak bookshelf (order B-2001) shipped yet?";
console.log(`Customer (${secretName}): ${message}\n`);

const run = await mt.interactions.run("support-any-shop", { inputs: { message, shopKey: secret.id } });

for (const entry of transcript(run)) {
  if (entry.kind === "toolResult") {
    const { result } = await mt.interactionRuns.toolResult(run.id, entry.sequence);
    console.log(`Tool result: ${result}`);
  }
}
console.log(`\nSupport: ${run.output}`);
```
<!-- /snippet -->
<!-- snippet: examples/09-call-your-code/python/ask_shop.py -->
```python title="Python"
import sys

from maitento import Maitento, transcript

# Which shop the customer is writing to: the name of the secret holding its key.
secret_name = sys.argv[1] if len(sys.argv) > 1 else "second-shop-api-key"

mt = Maitento()
# A run takes the secret's id: never its value, which stays in Maitento.
secret = mt.secrets.get_by_name(secret_name)

message = "Hi, has my oak bookshelf (order B-2001) shipped yet?"
print(f"Customer ({secret_name}): {message}\n")

run = mt.interactions.run("support-any-shop", inputs={"message": message, "shopKey": secret.id})

for entry in transcript(run):
    if entry.kind == "tool_result":
        print(f"Tool result: {mt.interaction_runs.tool_result(run.id, entry.sequence).result}")
print(f"\nSupport: {run.output}")
```
<!-- /snippet -->
<!-- snippet: examples/09-call-your-code/csharp/ask-shop.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Interactions;
using Maitento.Sdk;
using Maitento.Sdk.Transcripts;

// Which shop the customer is writing to: the name of the secret holding its key.
var secretName = args.Length > 0 ? args[0] : "second-shop-api-key";

await using var mt = MaitentoClient.CreateFromEnvironment();
// A run takes the secret's id: never its value, which stays in Maitento.
var secret = await mt.Secrets.GetByNameAsync(secretName)
    ?? throw new InvalidOperationException($"There is no secret called {secretName}: run setup first.");

var message = "Hi, has my oak bookshelf (order B-2001) shipped yet?";
Console.WriteLine($"Customer ({secretName}): {message}\n");

var inputs = new Dictionary<string, string> { ["message"] = message, ["shopKey"] = secret.Id.ToString() };
var run = await mt.Interactions.RunAsync("support-any-shop", inputs);

foreach (var entry in MaitentoTranscript.Of(run))
{
    if (entry.Item is InteractionProcessContextToolResult)
        Console.WriteLine($"Tool result: {(await mt.InteractionProcesses.GetToolResultAsync(run.Id, entry.Sequence))?.Result}");
}
Console.WriteLine($"\nSupport: {run.Output}");
```
<!-- /snippet -->
<!-- /tabs -->

Run it as the second shop (no argument), then as the first: `node ask-shop.ts orders-api-key`,
`python ask_shop.py orders-api-key` or `dotnet run ask-shop.cs -- orders-api-key`.

```text
Customer (second-shop-api-key): Hi, has my oak bookshelf (order B-2001) shipped yet?

Tool result: {"id":"B-2001","shop":"shop-2","customer":"Kai Moreno","items":["Oak bookshelf"],"total":189,"currency":"EUR","status":"in transit","refunded":0}

Support: Yes — order B-2001 (Oak bookshelf, €189.00) is currently **in transit**, so it has shipped. Nothing has been refunded on this order.
```

```text
Customer (orders-api-key): Hi, has my oak bookshelf (order B-2001) shipped yet?

Tool result: {"error": "Remote API returned status code: NotFound with response: {\"error\":\"There is no order B-2001\"}"}

Support: I checked and there is no order with the reference B-2001 in our system. It's possible the reference is slightly different, or the order was placed under another account. …
```

**Done when:** the same question finds order B-2001 with the second shop's key, and not with the first's. Your server
prints `shop-2: GET /orders/B-2001`, then `shop-1: GET /orders/B-2001`.

The agent can't switch shops: it never sees which key it is using, so a customer of one shop can't talk it into
reading another's orders. Two things to know:

- **A run that passes a name fails to start:** `requires valid GUID for secret ID shopKey - but value is:
  second-shop-api-key`.
- **An id that isn't one of your secrets** starts the run, but the tool call fails, and the agent is told
  `There was a problem calling the function: Could not find secret … for connector orders-get`.

## If it didn't work

- **The deploy fails with `Unable to resolve resource reference for secret 'orders-api-key'`.** The secret doesn't
  exist yet. Run setup, which stores it before it deploys, or `mt secret-create orders-api-key --value …`.
- **The deploy fails with `The connector's URL must be a public address: localhost is a loopback, private,
  link-local or internal address, which Maitento never calls [api:connectors:address-blocked]`.** The connector
  points at `localhost` (or `127.0.0.1`, or a name on your own network), and Maitento only calls addresses on the
  public internet. Use the tunnel's address.
- **`Tool result: {"error": "Maitento won't call …: the address isn't on the public internet. …", "code":
  "api:connectors:address-blocked"}`.** The connector's name resolves to a private address, such as a name that only
  works on your own network. Use the tunnel's address.
- **`Error connecting to remote API: Name or service not known (….trycloudflare.com:443)`.** The tunnel has stopped.
  A quick tunnel gets a new address every time it starts: put the new one in the connector and run setup again.
- **`Remote API returned status code: Unauthorized`.** The key in the secret and the key your server checks differ.
  See step 6.
- **`address already in use` when the server starts.** Something else has port 3000. Start the server with
  `PORT=3001` (Python: `--port 3001`) and point the tunnel at that port.
- **Your server is slow.** Maitento waits up to 100 seconds for an answer, then gives the agent an error.

## All the files

<!-- project: examples/09-call-your-code -->
**On GitHub:** [`examples/09-call-your-code`](https://github.com/maitento/maitento/tree/main/examples/09-call-your-code) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/09-call-your-code/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/09-call-your-code/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/09-call-your-code/csharp)

<details>
<summary>All the files in this project (5)</summary>

<!-- tabs: files -->
**`maitento/agents/support-agent.mtr`**
```hcl title="maitento/agents/support-agent.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a customer support agent for an online shop. Look orders up before you answer, and be precise about amounts."
summary = "Answers questions about orders"
functions = [
  {
    ref = @ref("get-order")
  }
]
```

**`maitento/connectors/open-api/orders-get.mtr`**
```hcl title="maitento/connectors/open-api/orders-get.mtr"
// Replace the host with your server's public URL (see the tutorial for a free tunnel).
method = "GET"
url = "https://YOUR-SERVER.example.com/orders/{orderId}"
description = "Looks up one order by its id"
auth = "Header"
parameters.path = [
  {
    name = "orderId"
    description = "The order id, for example A-1001"
  }
]
```

**`maitento/external-operations/open-api/get-order.mtr`**
```hcl title="maitento/external-operations/open-api/get-order.mtr"
connector = @ref("orders-get")
// Maitento sends the secret's value in this header. Your server checks it.
auth = {
  header = "X-Api-Key"
  secret = @ref("orders-api-key")
}
guidance = "Looks up an order: its items, total, status and how much has already been refunded."
```

**`maitento/interactions/one-shot/support-any-shop.mtr`**
```hcl title="maitento/interactions/one-shot/support-any-shop.mtr"
// The support desk for any shop: each run says which shop's key the get-order tool sends.
agent = {
  name = "Support"
  agent = @ref("support-agent")
}
task = "A customer writes: %%message%%"
inputs.prompts = [
  {
    name = "message"
    description = "What the customer wrote"
    required = true
  }
]
// The run passes the id of a secret, and Maitento sends that secret's value in X-Api-Key instead of the one the tool
// names. The agent never sees it.
inputs.functions.auth = [
  {
    name = "shopKey"
    description = "The id of the secret that holds the shop's API key"
    function = @ref("get-order")
    agent = @ref("support-agent")
    header = "X-Api-Key"
    required = true
  }
]
```

**`maitento/interactions/one-shot/support.mtr`**
```hcl title="maitento/interactions/one-shot/support.mtr"
agent = {
  name = "Support"
  agent = @ref("support-agent")
}
task = "A customer writes: %%message%%"
inputs.prompts = [
  {
    name = "message"
    description = "What the customer wrote"
    required = true
  }
]
```
<!-- /tabs -->

</details>

<!-- /project -->

## Review

You gave an agent a tool on your own API. Your key stays in Maitento, and you watched what happens when the key is
wrong, and how a run can choose between keys.

- **[Secret](../concepts/secrets.md):** a named value stored in your tenant. Project files name it; only Maitento
  reads its value. It must exist before you deploy anything that names it.
- **[`auth` on a tool](../concepts/tools.md#when-the-agent-calls-your-server):** the header, and the secret whose
  value goes in it. The connector's `auth = "Header"` says a credential is needed.
- **A key chosen by the run:** `inputs.functions.auth` on the interaction. The run passes a secret's id, and the
  agent never sees which.
- **Errors from your server**, like a 401 or a 404, reach the agent as the tool's result.

**Challenge:** Ana wants to know *when* her lamp will arrive, and an order only says `in transit`. Add a tracking
endpoint to your API, `GET /orders/{orderId}/tracking`, that answers with a carrier, a tracking number and an
estimated delivery date. Then add a connector and a tool for it, give the tool to the support agent, and ask "When
will my desk lamp (order A-1002) arrive?".

**Done when:** the agent calls your new tool, and its answer gives the carrier and the date.

The solution is in [`examples/09-call-your-code/solution`](../../examples/09-call-your-code/solution/): the server
with the new endpoint in all three languages, the `orders-tracking` connector, the `track-order` tool, and a `track`
script.

```text
Customer: Hi, when will my desk lamp (order A-1002) arrive?

Tool call: get-order {"additionalInputs":{"path.orderId":"A-1002"}}
Tool call: track-order {"additionalInputs":{"path.orderId":"A-1002"}}

Support: Thank you for your enquiry regarding order A-1002.

Your desk lamp (total £59.90) is currently in transit and has been dispatched with DPD. The tracking number is 15502938476154, and the estimated delivery date is 28 October 2026.
```

**Next:** [10. Approvals](10-approvals.md) lets the agent refund orders, with a person approving each refund first.
