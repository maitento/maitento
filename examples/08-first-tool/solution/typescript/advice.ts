import { Maitento, transcript } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

const run = await mt.interactions.run("run-advice", { inputs: { city: "Lisbon" } });

// The agent should call both tools: the weather, and the air.
for (const entry of transcript(run)) {
  if (entry.kind === "toolCall") console.log(`Tool call: ${entry.functionName} ${entry.argumentsJson}`);
}
console.log(`\n${run.output}`);
