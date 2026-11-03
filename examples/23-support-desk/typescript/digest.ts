import { Maitento } from "@maitento/sdk";

// Run tonight's digest now, instead of waiting for 23:55 UTC.
const mt = new Maitento();
const automation = await mt.automations.getByName("nightly-digest");
const { processId } = await mt.automations.trigger(automation.id);
console.log(`Started the nightly-digest app: ${processId}`);

// Follow the app run until it ends.
const finished = new Set(["Finished", "Error", "Killed"]);
let run = await mt.appRuns.get(processId);
while (!finished.has(run.status)) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  run = await mt.appRuns.get(processId);
}
for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
if (run.status !== "Finished") throw new Error(`The digest ended ${run.status}: ${run.failureDetails}`);

console.log(`\n${run.returnValue}\n`);
console.log(await mt.vfs.open("support-desk").readText("/reports/latest.md"));
