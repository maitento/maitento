import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// Run the shipping app. Its main(string weights, string destination) parameters are its inputs.
const [weights = "0.4, 3, kg, 12.5, , 45, 7", destination = "UK"] = process.argv.slice(2);
const run = await mt.apps.run("shipping", { inputs: { weights, destination } });

// What the app printed, what it returned, and every named output, in the order the app first set them.
for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nReturned: ${run.returnValue}`);
for (const output of run.outputs) console.log(`Output "${output.name}": ${output.value}`);
