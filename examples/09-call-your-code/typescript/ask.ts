import { Maitento, transcript } from "@maitento/sdk";

const mt = new Maitento();

const message = "Hi, I ordered a desk lamp last week (order A-1002). Has it shipped yet?";
console.log(`Customer: ${message}\n`);

// The agent looks the order up on your server before it answers.
const run = await mt.interactions.run("support", { inputs: { message } });

// What the agent did: each tool call, and what your server answered.
for (const entry of transcript(run)) {
  if (entry.kind === "toolCall") console.log(`Tool call: ${entry.functionName} ${entry.argumentsJson}`);
  if (entry.kind === "toolResult") {
    const { result } = await mt.interactionRuns.toolResult(run.id, entry.sequence);
    console.log(`Tool result: ${result}`);
  }
}
console.log(`\nSupport: ${run.output}`);
