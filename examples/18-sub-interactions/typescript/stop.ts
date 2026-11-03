import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.events.connect();

// Run the comparison again, and stop the first sub-interaction as soon as the lead researcher has started it.
let stopped: string | undefined;
const run = await mt.interactions.run("compare-countries", { inputs: { countries: "Portugal, Japan, Kenya" } }, {
  onUpdate: async (current) => {
    const first = current.swarm?.children[0];
    if (first && !stopped) {
      stopped = first.processId;
      await mt.runs.kill(first.processId, { type: "Interaction" });
      console.log(`Stopped sub-interaction ${first.processId}\n`);
    }
  },
});
console.log(run.output);

await mt.close();
process.exit(0);
