import { isTerminalStatus, Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

const run = await mt.interactions.start("explain", { inputs: { topic: "how volcanoes work" } });
console.log(`Started run ${run.id}`);

// Let it get going, then stop it.
await new Promise((resolve) => setTimeout(resolve, 2000));
await mt.runs.kill(run.id, { type: "Interaction" });
console.log("Asked Maitento to kill it");

// A kill takes a moment: read the run back until it has stopped.
let stopped = await mt.interactionRuns.get(run.id);
while (!isTerminalStatus(stopped.status)) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  stopped = await mt.interactionRuns.get(run.id);
}

console.log(`Run ${stopped.id}: ${stopped.status}`);
console.log(`Output: ${stopped.output ?? "none"}`);
console.log(`Why: ${stopped.failureDetails}`);
