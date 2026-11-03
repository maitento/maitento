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
