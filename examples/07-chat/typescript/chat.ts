import { createInterface } from "node:readline";
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// Read what you type, one line at a time.
const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
const ask = async (prompt: string): Promise<string> => {
  process.stdout.write(prompt);
  const line = await lines.next();
  return line.done ? "bye" : line.value;
};

console.log('Chat with the assistant. Type "bye" to finish.');

// The person speaks first, so the run waits for you straight away. Every time it waits, read a line and send it.
// The assistant's replies stream in through onToken.
await mt.interactions.run("chat", {}, {
  onToken: (text) => process.stdout.write(text),
  onWaiting: async (run) => {
    const message = await ask("\nYou: ");
    if (message.trim().toLowerCase() === "bye") {
      await mt.runs.kill(run.id, { type: "Interaction" });
      return;
    }
    process.stdout.write("Assistant: ");
    // No author named, so the message is recorded as the API key's user: you.
    await mt.interactionRuns.addMessage(run.id, { message });
  },
  // Saying bye stops the run, which is not a failure here.
  throwOnFailure: false,
});

await mt.close();
process.exit(0);
