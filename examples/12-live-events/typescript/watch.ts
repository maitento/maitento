import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
const time = () => new Date().toTimeString().slice(0, 8);

// "user" (the default) carries your own runs, whole. "tenant" carries a short summary of every run in the tenant.
const scope = process.argv[2] === "tenant" ? "tenant" : "user";
const events = await mt.events.connect({ scope });
console.log(`Watching ${scope === "tenant" ? "every run in the tenant" : "your runs"}. Press Ctrl+C to stop.`);

// User scope: an interaction run changed. (Apps, capsules and code pipelines have events of their own.)
events.on("interaction-process-updated", (run) => console.log(`${time()}  ${run.id}  ${run.status}`));

// Tenant scope: any run of any kind changed.
events.on("process-updated", (run) => console.log(`${time()}  ${run.id}  ${run.status}  (${run.type})`));

// The SDK reconnects by itself. Anything that changed in between was missed, so read what matters again.
events.on("disconnected", () => console.log(`${time()}  Connection lost. Reconnecting…`));
events.on("reconnected", async () => {
  const active = await mt.runs.list({ state: "Active", namespace: mt.namespace });
  console.log(`${time()}  Reconnected. Runs still going: ${active.items.length}`);
  for (const run of active.items) console.log(`${time()}  ${run.id}  ${run.status}`);
});
