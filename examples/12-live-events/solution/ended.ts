// Tutorial 12's challenge: whenever one of your runs ends, say how long it worked and how many tokens it used.
import { isTerminalStatus, Maitento } from "@maitento/sdk";

const mt = new Maitento();
const events = await mt.events.connect();
console.log("Waiting for your runs to end. Press Ctrl+C to stop.");

events.on("interaction-process-updated", async (run) => {
  if (!isTerminalStatus(run.status)) return;
  // The event carries the whole run. Its summary (tutorial 4) adds up the tokens.
  const tokens = (await mt.runs.get(run.id)).tokens;
  const seconds = (run.executionTime / 1000).toFixed(1);
  console.log(`${run.id}  ${run.status} after ${seconds}s, ${tokens?.input} tokens in and ${tokens?.output} out`);
});
