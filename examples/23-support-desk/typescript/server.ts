// Acme Coffee's support desk: the console's API (/api), the webhook Maitento calls (/maitento/webhook), and the shop
// API the desk's tools call (/shop). The page itself is ../web, served as it is. The API is described in ../web/API.md.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import express, { type Response } from "express";
import {
  Maitento, constantTimeEqual, parseWebhook, verifyWebhook, type AppProcess, type InteractionProcess,
} from "@maitento/sdk";

const port = Number(process.env.PORT ?? 3000);
const apiKey = process.env.SHOP_API_KEY;
const webhookSecret = process.env.WEBHOOK_SECRET;
if (!apiKey || !webhookSecret) throw new Error("Set SHOP_API_KEY and WEBHOOK_SECRET, the values you gave setup.ts.");

const mt = new Maitento();
const deskFiles = mt.vfs.open("support-desk");

// The desk's state, saved in desk.json so it survives a restart. Reset starts again from ../data/orders.json.
type Order = { id: string; customer: string; email: string; status: string; currency: string; refunded: number;
  items: { name: string; price: number }[] };
type Step = { id: string; tool: string; input: string; output: string | null; error: boolean; rejection: string | null };
type Ticket = {
  id: string; customer: string; email: string; subject: string; message: string; created: string;
  status: "new" | "triaged" | "drafting" | "approval" | "replied" | "rejected" | "failed";
  triage: { category: string; urgency: string; orderId: string | null; summary: string } | null;
  runId: string | null; loomId: string | null; updated: string | null;
  approval: { id: string; tool: string; arguments: string } | null;
  decision: { approved: boolean; reason: string | null } | null;
  steps: Step[]; reply: string | null; error: string | null;
};
const deskFile = process.env.DESK_FILE ?? "desk.json";
const freshDesk = () => ({ tickets: [] as Ticket[], orders: JSON.parse(readFileSync("../data/orders.json", "utf8")) as Order[] });
let desk = existsSync(deskFile) ? (JSON.parse(readFileSync(deskFile, "utf8")) as ReturnType<typeof freshDesk>) : freshDesk();
const save = () => writeFileSync(deskFile, JSON.stringify(desk, null, 2));
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const app = express();
// A webhook's signature covers the exact bytes Maitento sent, so its body is kept raw (and big: it carries a run's
// whole state). Everything else is JSON.
app.use("/maitento/webhook", express.raw({ type: "application/json", limit: "50mb" }));
app.use(express.json());
app.use(express.static("../web"));

// The browser listens on /api/events, and hears about every change as it happens (Server-Sent Events).
// region:events
const listeners = new Set<Response>();
const send = (event: string, data: unknown) => {
  for (const listener of listeners) listener.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};
const changed = (ticket: Ticket) => {
  save();
  send("ticket", ticket);
};

app.get("/api/events", (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write(": connected\n\n");
  listeners.add(res);
  req.on("close", () => listeners.delete(res));
});
setInterval(() => send("ping", {}), 15_000); // keeps proxies from closing a quiet stream
// endregion

// The two knowledge bases setup made: the shop's policies, and a temporary one for web pages the agent reads.
let knowledgeBases: { policies: string; webPages: string } | undefined;
async function findKnowledgeBases() {
  if (!knowledgeBases) {
    const partitions = await mt.partitions.list();
    const policies = partitions.find((p) => p.name === "shop-policies" && !p.isTemporary);
    const webPages = partitions.find((p) => p.name === "web-downloads" && p.isTemporary);
    if (!policies || !webPages) throw new Error("The shop-policies knowledge base is missing: run setup.ts first.");
    knowledgeBases = { policies: policies.id, webPages: webPages.id };
  }
  return knowledgeBases;
}

app.get("/api/status", async (_req, res) => {
  try {
    await findKnowledgeBases();
    res.json({ ok: true, error: null });
  } catch (error) {
    res.json({ ok: false, error: errorText(error) });
  }
});

app.get("/api/tickets", (_req, res) => {
  res.json({ tickets: desk.tickets });
});

app.get("/api/scenarios", (_req, res) => {
  res.json({ scenarios: JSON.parse(readFileSync("../data/scenarios.json", "utf8")) });
});

// 1. A ticket comes in: triage it, then start drafting the reply.
// region:ticket
app.post("/api/tickets", (req, res) => {
  const { customer, email, subject, message } = req.body as Record<string, string | undefined>;
  if (!customer?.trim() || !email?.includes("@") || !message?.trim()) {
    res.status(400).json({ error: "A ticket needs a customer, an email address and a message." });
    return;
  }
  const ticket: Ticket = {
    id: `T-${1001 + desk.tickets.length}`, customer: customer.trim(), email: email.trim(), subject: subject?.trim() ?? "",
    message: message.trim(), created: new Date().toISOString(), status: "new", triage: null, runId: null,
    loomId: null, updated: null, approval: null, decision: null, steps: [], reply: null, error: null,
  };
  desk.tickets.unshift(ticket);
  changed(ticket);
  res.status(201).json(ticket);
  void work(ticket); // the browser hears how it goes over /api/events
});

async function work(ticket: Ticket) {
  try {
    // Triage takes a few seconds and answers in JSON, so wait for it (tutorial 3).
    const triage = await mt.interactions.run("triage-ticket", { inputs: { message: ticket.message } });
    ticket.triage = JSON.parse(triage.output!) as NonNullable<Ticket["triage"]>;
    ticket.status = "triaged";
    changed(ticket);

    // The reply can take a minute, and may wait for a person to approve a refund.
    // Start it and move on: the webhook says when it changes (tutorial 11).
    const { category, urgency, orderId } = ticket.triage;
    const { policies, webPages } = await findKnowledgeBases();
    const run = await mt.interactions.start("draft-reply", {
      inputs: { customer: ticket.customer, email: ticket.email, message: ticket.message, category, urgency, orderId,
        policiesId: policies },
      webDownloadPartitionId: webPages, // where web pages the agent reads are kept (tutorial 14)
    });
    ticket.runId = run.id;
    ticket.loomId = run.looms[0]?.loom ?? null; // this customer's memory (tutorial 20)
    ticket.status = "drafting";
    changed(ticket);
  } catch (error) {
    ticket.status = "failed";
    ticket.error = errorText(error);
    changed(ticket);
  }
}
// endregion

// 2. Maitento calls this whenever an interaction run or an app run changes (tutorial 11).
// region:webhook
app.put("/maitento/webhook", async (req, res) => {
  const body = req.body as Buffer; // the raw body, which the signature covers
  if (!(await verifyWebhook(req.headers, body, webhookSecret))) {
    res.sendStatus(401);
    return;
  }
  const delivery = parseWebhook(req.headers, body);
  res.sendStatus(204); // answer at once, and do the work after
  try {
    if (delivery.type === "InteractionProcess") await runChanged(delivery.entity);
    if (delivery.type === "AppProcess") digestChanged(delivery.entity);
  } catch (error) {
    console.error(`Webhook for ${delivery.id}: ${errorText(error)}`);
  }
});

async function runChanged(run: InteractionProcess) {
  // Webhooks come for every run in the tenant: keep only this desk's. Deliveries can repeat and arrive out of
  // order, so keep only the newest state of each run.
  const ticket = desk.tickets.find((t) => t.runId === run.id);
  const updated = run.dateUpdated.toISOString();
  const isOld = () => ticket?.updated != null && updated <= ticket.updated;
  if (!ticket || isOld()) return;
  const steps = await toolCalls(run, ticket.steps);
  if (isOld()) return; // a newer delivery got here while the tool results were being read

  const approval = run.status === "PendingApproval" ? run.pendingApproval : null;
  ticket.updated = updated;
  ticket.steps = steps;
  ticket.approval = approval && { id: approval.id, tool: approval.functionName, arguments: approval.argumentsJson };
  ticket.reply = run.output;
  ticket.error = run.failureDetails;
  if (run.status === "PendingApproval") ticket.status = "approval";
  else if (run.status === "Finished") ticket.status = ticket.decision?.approved === false ? "rejected" : "replied";
  else if (run.status === "Error" || run.status === "Killed") ticket.status = "failed";
  else ticket.status = "drafting";
  changed(ticket);
}
// endregion

// What the agent did: each tool call and its result. A long result is kept outside the run, so read it once.
// region:steps
async function toolCalls(run: InteractionProcess, known: Step[]): Promise<Step[]> {
  return Promise.all(run.context.toolCall.map(async (call) => {
    const result = run.context.toolResult.find((r) => r.toolCallId === call.toolCallId);
    let output = result?.result ?? known.find((s) => s.id === call.toolCallId)?.output ?? null;
    if (result && output === null) output = (await mt.interactionRuns.toolResult(run.id, result.sequence)).result;
    return {
      id: call.toolCallId, tool: call.functionName, input: call.argumentsJson, output,
      error: result?.isError ?? false, rejection: result?.rejectionReason ?? null,
    };
  }));
}
// endregion

// 3. A person approves or rejects the refund the agent asked for (tutorial 10).
// region:approval
app.post("/api/tickets/:id/:decision", async (req, res) => {
  const ticket = desk.tickets.find((t) => t.id === req.params.id);
  const approval = ticket?.approval;
  const approve = req.params.decision === "approve";
  if (!ticket?.runId || !approval || !["approve", "reject"].includes(req.params.decision)) {
    res.status(409).json({ error: "This ticket isn't waiting for an approval." });
    return;
  }
  const reason = (req.body as { reason?: string }).reason?.trim() || "The support team said no.";
  ticket.approval = null; // a second click finds nothing to decide
  ticket.decision = { approved: approve, reason: approve ? null : reason };
  ticket.status = "drafting";
  changed(ticket);
  try {
    if (approve) await mt.interactionRuns.approve(ticket.runId, { approvalId: approval.id });
    else await mt.interactionRuns.reject(ticket.runId, { approvalId: approval.id, reason });
    res.json(ticket);
  } catch (error) {
    Object.assign(ticket, { approval, decision: null, status: "approval" });
    changed(ticket);
    res.status(502).json({ error: errorText(error) });
  }
});
// endregion

// 4. What the desk remembers about a ticket's customer: the threads of their memory (tutorial 20).
// region:memory
app.get("/api/tickets/:id/memory", async (req, res) => {
  const loomId = desk.tickets.find((t) => t.id === req.params.id)?.loomId;
  try {
    const threads = loomId ? await mt.looms.threads(loomId, { sort: "Newest", limit: 20 }) : [];
    res.json({ threads: threads.map((t) => ({ content: t.content, kind: t.kind, created: t.dateCreated })) });
  } catch (error) {
    res.status(502).json({ error: errorText(error) });
  }
});
// endregion

// 5. The nightly digest: the latest report the capsule wrote, and running it now (tutorials 16, 17 and 21).
// region:digest
let digest = { running: false, error: null as string | null };
const readReport = async (path: string) => ((await deskFiles.exists(path)) ? deskFiles.readText(path) : null);

app.get("/api/digest", async (_req, res) => {
  try {
    const [report, counts] = await Promise.all([readReport("/reports/latest.md"), readReport("/reports/latest.json")]);
    res.json({ ...digest, report, counts: counts ? JSON.parse(counts) : null });
  } catch (error) {
    res.status(502).json({ error: errorText(error) });
  }
});

app.post("/api/digest", async (_req, res) => {
  try {
    const automation = await mt.automations.getByName("nightly-digest");
    await mt.automations.trigger(automation.id);
    digest = { running: true, error: null };
    send("digest", digest);
    res.status(202).json(digest);
  } catch (error) {
    res.status(502).json({ error: errorText(error) });
  }
});

function digestChanged(run: AppProcess) {
  if (run.triggeredByAutomatedActionName !== "nightly-digest") return;
  const ended = ["Finished", "Error", "Killed"].includes(run.status);
  digest = { running: !ended, error: ended && run.status !== "Finished" ? run.failureDetails ?? run.status : null };
  send("digest", digest);
}
// endregion

// Reset demo: forget the tickets and refunds. Maitento keeps its memories, reports and runs.
app.post("/api/reset", (_req, res) => {
  desk = freshDesk();
  save();
  send("reset", {});
  res.json({ ok: true });
});

// 6. The shop API the desk's tools call. Maitento sends the shop-api-key secret in X-Api-Key (tutorial 9).
// region:shop
app.use("/shop", (req, res, next) => {
  if (!constantTimeEqual(req.get("X-Api-Key") ?? "", apiKey)) {
    res.status(401).json({ error: "Unauthorised" });
    return;
  }
  next();
});

app.get("/shop/orders/:orderId", (req, res) => {
  const order = desk.orders.find((o) => o.id === req.params.orderId);
  if (order) res.json(order);
  else res.status(404).json({ error: `There is no order ${req.params.orderId}` });
});

app.post("/shop/orders/:orderId/refund", (req, res) => {
  const order = desk.orders.find((o) => o.id === req.params.orderId);
  if (!order) {
    res.status(404).json({ error: `There is no order ${req.params.orderId}` });
    return;
  }
  const { amount, reason } = req.body as { amount: number; reason: string };
  const refundable = order.items.reduce((sum, item) => sum + item.price, 0) - order.refunded;
  if (!(amount > 0 && amount <= refundable)) {
    res.status(400).json({ error: `You can refund between 0.01 and ${refundable.toFixed(2)} ${order.currency}` });
    return;
  }
  order.refunded += amount;
  save();
  console.log(`Refunded ${amount} ${order.currency} on ${order.id}: ${reason}`);
  res.json({ orderId: order.id, refunded: amount, totalRefunded: order.refunded, currency: order.currency });
});

// The nightly-digest app asks for one day's tickets.
app.get("/shop/tickets/:date", (req, res) => {
  const day = desk.tickets.filter((t) => t.created.startsWith(req.params.date));
  res.json({
    date: req.params.date,
    tickets: day.map((t) => ({ id: t.id, customer: t.customer, category: t.triage?.category ?? null,
      urgency: t.triage?.urgency ?? null, status: t.status })),
  });
});
// endregion

app.listen(port, () => console.log(`Acme Coffee's support desk on http://localhost:${port}`));
