import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// Run the receipt app. Its main(string item, decimal price, int quantity) parameters are its inputs,
// and every input goes in as text.
const [item = "Notebook", price = "4.5", quantity = "3"] = process.argv.slice(2);
const run = await mt.apps.run("receipt", { inputs: { item, price, quantity } });

// What the app printed, what it returned, and every named output, in the order the app first set them.
for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nReturned: ${run.returnValue}`);
for (const output of run.outputs) console.log(`Output "${output.name}": ${output.value}`);
