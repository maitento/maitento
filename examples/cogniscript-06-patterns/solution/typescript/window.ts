import { Maitento } from "@maitento/sdk";

// The challenge: deploy the tutorial's project, then this folder's app, which uses its headline interaction.
const mt = new Maitento();
await mt.deploy("../../maitento");
await mt.deploy("../maitento");

const topics = process.argv[2] ?? "electric cars, city farming, space tourism, quantum computing";
const run = await mt.apps.run("headlines-window", { inputs: { topics } });

for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nReturned: ${run.returnValue}`);
for (const output of run.outputs) console.log(`Output "${output.name}": ${output.value}`);
