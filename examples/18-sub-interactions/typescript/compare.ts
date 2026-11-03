import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// region:run
// The lead researcher starts one sub-interaction per country, in parallel, then compares the answers.
const run = await mt.interactions.run("compare-countries", { inputs: { countries: "Portugal, Japan, Kenya" } });
console.log(run.output);
// endregion

// region:lineage
// Every run the lead researcher started names this run as its parent.
console.log(`\nSub-interactions of ${run.id}:`);
const children = await mt.runs.list({ parentProcessId: run.id });
for (const summary of children.items) {
  const child = await mt.interactionRuns.get(summary.id);
  const country = child.inputs.find((input) => input.name === "country")?.value;
  const why = summary.failureSummary ? ` (${summary.failureSummary})` : "";
  console.log(`- ${summary.definitionName} for ${country}: ${summary.status}${why}`);
}
// endregion
