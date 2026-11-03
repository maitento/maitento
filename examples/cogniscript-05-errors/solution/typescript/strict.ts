import { Maitento } from "@maitento/sdk";

// The challenge: deploy this folder's app, then claim a refund it should refuse.
const mt = new Maitento();
await mt.deploy("../maitento");

const expenses = process.argv[2] ?? "Taxi 23.50; Refund -10; Train 41.20";
const limit = process.argv[3] ?? "100";
const run = await mt.apps.run("expenses-strict", { inputs: { expenses, limit } }, { throwOnFailure: false });

for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nStatus: ${run.status}`);
if (run.status === "Finished") {
  console.log(`Returned: ${run.returnValue}`);
  for (const output of run.outputs) console.log(`Output "${output.name}": ${output.value}`);
} else {
  console.log(`Failure: ${run.failureDetails}`);
}
