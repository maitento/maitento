import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
const automation = await mt.automations.findByName("daily-taglines");
if (!automation) throw new Error("Run schedule.ts first.");

// Run it now, instead of waiting for the schedule.
const { processId } = await mt.automations.trigger(automation.id);

// Every execution goes in the automation's history, newest first. Wait until this one has finished.
let [entry] = await mt.automations.history(automation.id, { limit: 1 });
for (let attempt = 1; attempt < 60 && !(entry?.processId === processId && entry.dateCompleted); attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  [entry] = await mt.automations.history(automation.id, { limit: 1 });
}
console.log(`${entry.triggerType} run ${entry.processId}: ${entry.outcome}${entry.errorMessage ? ` (${entry.errorMessage})` : ""}`);

// The run itself is an ordinary app run.
if (entry.outcome === "Success") {
  const run = await mt.appRuns.get(processId);
  for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
}
