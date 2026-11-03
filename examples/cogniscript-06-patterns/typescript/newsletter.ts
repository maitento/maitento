import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// Run the newsletter app. It runs the headlines app itself, as a child.
const topics = process.argv[2] ?? "electric cars, city farming, space tourism, quantum computing";
const run = await mt.apps.run("newsletter", { inputs: { topics } });

for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nReturned: ${run.returnValue}`);
for (const output of run.outputs) console.log(`Output "${output.name}": ${output.value}`);
