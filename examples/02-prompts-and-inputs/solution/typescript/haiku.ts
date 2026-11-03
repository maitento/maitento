import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// A third input, language, is optional like mood: leave it out and the haiku is in English.
const run = await mt.interactions.run("haiku", {
  inputs: { topic: "autumn rain", mood: "calm", language: "Portuguese" },
});
console.log(run.output);
