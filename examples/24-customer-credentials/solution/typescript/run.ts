import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// No stack named here: the interaction names its own. Run ../../typescript/customer.ts first, to make it.
const run = await mt.interactions.run("summarise", {
  inputs: { text: "The new dashboard loads twice as fast, though the export button moved and took a while to find." },
});
console.log(run.output);
console.log(`Ran on stack "${run.credentialStack?.stackName}", chosen at the ${run.credentialStack?.source}`);
