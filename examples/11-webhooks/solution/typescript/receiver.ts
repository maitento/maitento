// The challenge: tutorial 11's receiver, which also says when a run is waiting for someone to approve a tool call.
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

  // The challenge: a run waiting for an approval says what it wants to do, so someone can decide.
  const approval = run.pendingApproval;
  if (run.status === "PendingApproval" && approval) {
    console.log(`  needs approval: ${approval.agentName} wants to call ${approval.functionName} with ${approval.argumentsJson}`);
    console.log(`  approve with: mt interaction-approve ${run.id}`);
  }

  // Answer quickly: Maitento waits up to 100 seconds, then tries again later.
  res.sendStatus(204);
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Webhook receiver listening on http://localhost:${port}/maitento/webhook`));
