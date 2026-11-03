import { Maitento, transcript } from "@maitento/sdk";

// The run, not the model, decides the unit: celsius, unless you pass another on the command line.
const temperatureUnit = process.argv[2] ?? "celsius";

const mt = new Maitento();
await mt.deploy("../maitento");

const run = await mt.interactions.run("weather", { inputs: { city: "Lisbon", temperatureUnit } });

// What the agent did: each tool call it made, and what came back.
for (const entry of transcript(run)) {
  if (entry.kind === "toolCall") console.log(`Tool call: ${entry.functionName} ${entry.argumentsJson}`);
  if (entry.kind === "toolResult") {
    const { result } = await mt.interactionRuns.toolResult(run.id, entry.sequence);
    console.log(`Tool result: ${result}`);
  }
}
console.log(`\n${run.output}`);
