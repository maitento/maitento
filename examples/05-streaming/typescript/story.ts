import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// onToken gets the story word by word, as it's written: run() opens Maitento's live event stream for it.
const run = await mt.interactions.run("story", { inputs: { subject: "a hedgehog who is afraid of the dark" } }, {
  onToken: (text) => process.stdout.write(text),
});

// The streamed text was for showing progress. The finished run is the record.
console.log(`\n\n[${run.status}: the output has ${run.output?.length ?? 0} characters]`);

await mt.close();
