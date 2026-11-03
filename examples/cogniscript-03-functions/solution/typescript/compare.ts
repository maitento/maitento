import { Maitento } from "@maitento/sdk";

// The challenge: deploy this folder's app, compare, and quote the tutorial's parcels for three destinations.
const mt = new Maitento();
await mt.deploy("../maitento");

const [weights = "0.4, 3, kg, 12.5, , 45, 7", destinations = "UK, EU, World"] = process.argv.slice(2);
const run = await mt.apps.run("compare", { inputs: { weights, destinations } });
for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nReturned: ${run.returnValue}`);
