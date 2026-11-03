import { Maitento } from "@maitento/sdk";

// Where Maitento should send interaction updates, and the secret it signs each one with.
const url = process.env.WEBHOOK_URL;
const secret = process.env.WEBHOOK_SECRET;
if (!url || !secret) throw new Error("Set WEBHOOK_URL (your receiver's public address) and WEBHOOK_SECRET first.");

const mt = new Maitento();
const hook = await mt.webhooks.create({ type: "InteractionProcess", url, secret });
console.log(`Webhook ${hook.id} registered: interaction updates will be sent to ${url}`);
