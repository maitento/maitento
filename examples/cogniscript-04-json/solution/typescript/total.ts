import { readFileSync } from "node:fs";
import { Maitento } from "@maitento/sdk";

// The challenge: deploy this folder's app, then total a list of orders.
const mt = new Maitento();
await mt.deploy("../maitento");

const orders = process.argv[2] ?? readFileSync("../data/orders.json", "utf8");
const run = await mt.apps.run("orders-total", { inputs: { orders } });

for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nReturned: ${run.returnValue}`);
for (const output of run.outputs) console.log(`Output "${output.name}": ${output.value}`);
