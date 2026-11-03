import { Maitento, transcript } from "@maitento/sdk";

const mt = new Maitento();
// Both tools send the orders-api-key secret that the tutorial's setup stored.
await mt.deploy("../maitento");

const message = "Hi, when will my desk lamp (order A-1002) arrive?";
console.log(`Customer: ${message}\n`);

const run = await mt.interactions.run("support", { inputs: { message } });

for (const entry of transcript(run)) {
  if (entry.kind === "toolCall") console.log(`Tool call: ${entry.functionName} ${entry.argumentsJson}`);
}
console.log(`\nSupport: ${run.output}`);
