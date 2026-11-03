import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
const userName = process.argv[2] ?? "Ana";

const loom = (await mt.looms.list()).find((l) => l.name === `wren-chat/Wren/${userName}`);
if (!loom) throw new Error(`Wren has no memory of ${userName} yet: talk to it first.`);

// Ask for a night weave now, instead of waiting for five quiet minutes. It runs in the background.
const before = (await mt.looms.nightWeavings(loom.id, { limit: 1 }))[0]?.id;
await mt.looms.nightWeave(loom.id);
console.log("Night weaving…");

// Wait for the new night weaving to finish.
let night = (await mt.looms.nightWeavings(loom.id, { limit: 1 }))[0];
while (!night || night.id === before || night.status === "Running") {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  night = (await mt.looms.nightWeavings(loom.id, { limit: 1 }))[0];
}
const { sessionsConsolidated, threadsMerged, panelsWoven } = night.counts;
console.log(`${night.status}. Conversations: ${sessionsConsolidated}, threads merged: ${threadsMerged}, portraits: ${panelsWoven}\n`);

// The portrait night weaving wrote of each person, which Wren reads first when it next talks to them.
for (const panel of await mt.looms.panels(loom.id)) console.log(`## ${panel.subject}\n${panel.text}\n`);
