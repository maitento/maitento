import { Maitento } from "@maitento/sdk";

const id = process.argv[2];
if (!id) throw new Error("Pass the id of a run: node status.ts <run id>");

const mt = new Maitento();

// The run as it is right now.
const run = await mt.interactionRuns.get(id);
console.log(`Run ${run.id}: ${run.status}`);

if (run.status === "Finished") {
  // runs.get() gives a short summary of any kind of run, with the tokens it used.
  const summary = await mt.runs.get(id);
  const seconds = (run.executionTime / 1000).toFixed(1);
  console.log(`Worked for ${seconds}s, using ${summary.tokens?.input} tokens in and ${summary.tokens?.output} out.`);
  // The start of the answer.
  console.log(`${run.output?.slice(0, 160)}…`);
} else if (run.status === "Error" || run.status === "Killed") {
  console.log(`It stopped: ${run.failureDetails}`);
}
