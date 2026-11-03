import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// start() returns as soon as Maitento has the run. It doesn't wait for the answer.
const run = await mt.interactions.start("explain", { inputs: { topic: "why the sky is blue" } });

console.log(`Started run ${run.id}: ${run.status}`);
console.log(`Check on it with: node status.ts ${run.id}`);
