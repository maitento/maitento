import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

const notes = await mt.vfs.findByName("notes");
if (!notes) throw new Error("Run setup.ts first.");

const request = process.argv[2] ?? "Add eggs and coffee to my shopping list, then tell me what is on it.";

// notesVfsId fills in the file system's id for all three tools. The model never sees it.
const run = await mt.interactions.run("notes", { inputs: { request, notesVfsId: notes.id } });
console.log(run.output);

console.log("\nWhat the agent did:");
for (const call of run.context.toolCall) console.log(`- ${call.functionName} ${call.argumentsJson}`);

console.log("\nThe file now says:\n" + (await mt.vfs.open("notes").readText("/shopping.md")));
