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
