import { Maitento } from "@maitento/sdk";

// The challenge: deploy this folder's app, shipping-report, and run it with the tutorial's parcels.
const mt = new Maitento();
await mt.deploy("../maitento");

const [weights = "0.4, 3, kg, 12.5, , 45, 7", destination = "UK"] = process.argv.slice(2);
const run = await mt.apps.run("shipping-report", { inputs: { weights, destination } });
for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nReturned: ${run.returnValue}`);
