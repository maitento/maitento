import { readFileSync } from "node:fs";
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// The order goes in as JSON text: an app's inputs are always text.
const order = process.argv[2] ?? readFileSync("../data/order.json", "utf8");
const run = await mt.apps.run("order-summary", { inputs: { order } });

// What the app printed, what it returned, and every named output, in the order the app first set them.
for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nReturned: ${run.returnValue}`);
for (const output of run.outputs) console.log(`Output "${output.name}": ${output.value}`);
