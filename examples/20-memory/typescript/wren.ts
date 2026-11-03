import { createInterface } from "node:readline";
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");
await mt.events.connect();

const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
const ask = async (prompt: string): Promise<string> => {
  process.stdout.write(prompt);
  const line = await lines.next();
  return line.done ? "bye" : line.value;
};

// Wren keeps a separate memory for each person, chosen by the userName input.
const userName = process.argv[2] ?? (await ask("Your name: "));
console.log(`Talking to Wren as ${userName}. Type "bye" to finish.`);

await mt.interactions.run("wren-chat", { inputs: { userName } }, {
  onToken: (text) => process.stdout.write(text),
  onWaiting: async (run) => {
    const message = await ask("\nYou: ");
    if (message.trim().toLowerCase() === "bye") {
      await mt.runs.kill(run.id, { type: "Interaction" });
      return;
    }
    process.stdout.write("Wren: ");
    await mt.interactionRuns.addMessage(run.id, { message, messageAuthorName: userName });
  },
  throwOnFailure: false,
});

await mt.close();
process.exit(0);
