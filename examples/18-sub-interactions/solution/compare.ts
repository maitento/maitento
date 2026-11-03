import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("./maitento");

// The lead researcher starts a country-facts and a country-dish run per country, all at once.
const run = await mt.interactions.run("compare-countries", { inputs: { countries: "Portugal, Japan, Kenya" } });
console.log(run.output);

console.log(`\nSub-interactions of ${run.id}:`);
const children = await mt.runs.list({ parentProcessId: run.id });
for (const summary of children.items) {
  const child = await mt.interactionRuns.get(summary.id);
  const country = child.inputs.find((input) => input.name === "country")?.value;
  console.log(`- ${summary.definitionName} for ${country}: ${summary.status}`);
}
