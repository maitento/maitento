import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// The interaction declares two inputs: topic (required) and mood (optional).
const run = await mt.interactions.run("haiku", {
  inputs: { topic: "autumn rain", mood: "calm" },
});
console.log(run.output);
