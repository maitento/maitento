import { Maitento } from "@maitento/sdk";

// Deploys a small interaction and runs it. Your receiver hears about the run as it changes.
const mt = new Maitento();
await mt.deploy("../maitento");

const run = await mt.interactions.run("fun-fact", { inputs: { topic: "octopuses" } });
console.log(`Run ${run.id} ended ${run.status}: ${run.output}`);
