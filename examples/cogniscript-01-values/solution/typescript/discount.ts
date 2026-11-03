import { Maitento } from "@maitento/sdk";

// The challenge: deploy this folder's app, which takes a fourth input, discount.
const mt = new Maitento();
await mt.deploy("../maitento");

const [item = "Notebook", price = "4.5", quantity = "3", discount = "10"] = process.argv.slice(2);
const run = await mt.apps.run("discount-receipt", { inputs: { item, price, quantity, discount } });
for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nReturned: ${run.returnValue}`);
