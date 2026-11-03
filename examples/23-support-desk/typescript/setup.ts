import { readdir, readFile } from "node:fs/promises";
import { Maitento, type CreateAutomatedActionRequest } from "@maitento/sdk";

// The key your app's API checks, and where Maitento sends run updates: your app's public URL + /maitento/webhook.
const apiKey = process.env.SHOP_API_KEY;
const webhookUrl = process.env.WEBHOOK_URL;
const webhookSecret = process.env.WEBHOOK_SECRET;
if (!apiKey || !webhookUrl || !webhookSecret) {
  throw new Error("Set SHOP_API_KEY, WEBHOOK_URL and WEBHOOK_SECRET first.");
}

const mt = new Maitento();
const namespace = process.env.MAITENTO_NAMESPACE ?? "tutorials";

// 1. The key the tools send to your app, kept as a secret (tutorial 9).
const secret = await mt.secrets.findByName("shop-api-key");
if (secret) await mt.secrets.update(secret.id, { name: "shop-api-key", value: apiKey });
else await mt.secrets.create({ name: "shop-api-key", value: apiKey });

// 2. The desk's file system, with the report script in it. The capsule mounts it, so it must exist
//    before the deploy (tutorials 15 and 21).
if (!(await mt.namespaces.find(namespace))) await mt.namespaces.create({ name: namespace });
if (!(await mt.vfs.findByName("support-desk"))) await mt.vfs.create({ name: "support-desk" });
const script = await readFile("../data/count_tickets.py", "utf8");
await mt.vfs.open("support-desk").writeText("/count_tickets.py", script);

// 3. The shop's policies in a knowledge base (tutorial 13), and a temporary one for web pages (tutorial 14).
const partitions = await mt.partitions.list();
const policies = partitions.find((p) => p.name === "shop-policies" && !p.isTemporary)
  ?? (await mt.partitions.create({ name: "shop-policies" }));
for (const file of await readdir("../knowledge")) await mt.files.upload(policies.id, `../knowledge/${file}`);
if (!partitions.some((p) => p.name === "web-downloads" && p.isTemporary)) {
  await mt.partitions.create({ name: "web-downloads", isTemporary: true, fileLifetimeHours: 24 });
}

// 4. The agents, tools, app and capsule.
await mt.deploy("../maitento");

// 5. Maitento calls your app whenever an interaction run (a reply) or an app run (the digest) changes (tutorial 11).
const hooks = await mt.webhooks.list();
for (const type of ["InteractionProcess", "AppProcess"] as const) {
  if (!hooks.some((hook) => hook.url === webhookUrl && hook.type === type)) {
    await mt.webhooks.create({ type, url: webhookUrl, secret: webhookSecret });
  }
}

// 6. The nightly digest runs at 23:55 UTC (tutorial 17). An automation runs the app version it names,
//    so running setup again points it at the version just deployed.
const app = await mt.apps.getByName("nightly-digest");
const latest = Math.max(...app.versions.map((v) => v.version));
const digest: CreateAutomatedActionRequest = {
  name: "nightly-digest",
  description: "Counts the day's support tickets",
  actions: [{
    name: "write-digest",
    config: {
      $type: "app",
      version: { id: app.id, version: latest },
      inputs: [{ name: "namespaceName", value: namespace }],
    },
  }],
};
const existing = await mt.automations.findByName("nightly-digest");
const automation = existing ? await mt.automations.update(existing.id, digest) : await mt.automations.create(digest);
if (!automation.schedules.some((s) => s.name === "every-night")) {
  await mt.automations.addSchedule(automation.id, { name: "every-night", minute: "55", hour: "23" });
}

// The policies take a few seconds to index. Wait until the agent can search them.
for (;;) {
  const files = [];
  for await (const file of mt.partitions.files(policies.id)) files.push(file);
  if (files.length > 0 && files.every((f) => f.isVectorGenerated)) break;
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
console.log("The support desk is set up. Start the app with: node server.ts");
