import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// onUpdate gets each new state of the run, and a run changes often. Print its status only when that changes.
let status = "";
const run = await mt.interactions.run("story", { inputs: { subject: "a hedgehog who is afraid of the dark" } }, {
  onToken: (text) => process.stdout.write(text),
  onUpdate: (update) => {
    if (update.status === status) return;
    status = update.status;
    console.log(`\n[${status}]`);
  },
});

console.log(`\n[the output has ${run.output?.length ?? 0} characters]`);

await mt.close();
