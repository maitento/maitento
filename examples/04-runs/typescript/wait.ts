import { isTerminalStatus, Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

const started = Date.now();
let run = await mt.interactions.start("explain", { inputs: { topic: "how rainbows form" } });
console.log(`Started run ${run.id}`);

// Read the run once a second until it ends, and say whenever its status changes.
let status = "";
while (true) {
  if (run.status !== status) {
    status = run.status;
    console.log(`${((Date.now() - started) / 1000).toFixed(1)}s  ${status}`);
  }
  if (isTerminalStatus(run.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 1000));
  run = await mt.interactionRuns.get(run.id);
}

// A finished run has its answer in output; one that failed or was killed says why in failureDetails.
console.log(run.status === "Finished" ? `${run.output?.slice(0, 160)}…` : run.failureDetails);
