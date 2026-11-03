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

// In a real app the person is signed in to your app, and these come from your own user record.
const name = (await ask("Your name: ")).trim() || "Guest";
const personId = "3f2c8a51-6d0e-4b8e-9a4b-2f1d7c9e5a10"; // your app's id for this person: any GUID

console.log('Chat with the assistant. Type "bye" to finish.');

const run = await mt.interactions.run("chat", {}, {
  onToken: (text) => process.stdout.write(text),
  onWaiting: async (waiting) => {
    const message = await ask(`\n${name}: `);
    if (message.trim().toLowerCase() === "bye") {
      await mt.runs.kill(waiting.id, { type: "Interaction" });
      return;
    }
    process.stdout.write("Assistant: ");
    // With an API key you may name the author: the name and id are recorded as you give them.
    await mt.interactionRuns.addMessage(waiting.id, { message, messageAuthorName: name, messageAuthorId: personId });
  },
  throwOnFailure: false,
});

// Who said what, as the run recorded it.
console.log("\nRecorded:");
for (const m of run.context.humanMessage) console.log(`- ${m.author.name} (${m.author.id}): ${m.message}`);

await mt.close();
process.exit(0);
