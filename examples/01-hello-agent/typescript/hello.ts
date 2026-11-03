import { Maitento } from "@maitento/sdk";

// Reads your API key and namespace from MAITENTO_API_KEY and MAITENTO_NAMESPACE.
const mt = new Maitento();

// Send the agent and the interaction in ../maitento to Maitento.
await mt.deploy("../maitento");

// Start the "hello" interaction and wait for its answer.
const run = await mt.interactions.run("hello");
console.log(run.output);
