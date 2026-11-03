import { Maitento } from "@maitento/sdk";

const mt = new Maitento();

// Deploys the greeter (unchanged, so it stays at its current version) and the new joke interaction.
await mt.deploy("../maitento");

const run = await mt.interactions.run("joke");
console.log(run.output);
