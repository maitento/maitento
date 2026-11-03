import { Maitento } from "@maitento/sdk";

// The challenge: deploy the tutorial's project, then this folder's app and interaction, which use its agent.
const mt = new Maitento();
await mt.deploy("../../maitento");
await mt.deploy("../maitento");

const run = await mt.apps.run("best-tagline", { inputs: { product: "a reusable bamboo coffee cup" } });
for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nReturned: ${run.returnValue}`);
