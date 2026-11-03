import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// The app's two inputs: the expenses, as "what amount" pairs separated by semicolons, and the spending limit.
const expenses = process.argv[2] ?? "Taxi 23.50; Lunch 12; Hotel ninety; Train 41.20";
const limit = process.argv[3] ?? "100";

// throwOnFailure: false hands back a failed run instead of throwing, so you can read what it reports.
const run = await mt.apps.run("expenses", { inputs: { expenses, limit } }, { throwOnFailure: false });

for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nStatus: ${run.status}`);
if (run.status === "Finished") {
  console.log(`Returned: ${run.returnValue}`);
  for (const output of run.outputs) console.log(`Output "${output.name}": ${output.value}`);
} else {
  console.log(`Failure: ${run.failureDetails}`);
}
