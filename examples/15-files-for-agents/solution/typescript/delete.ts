import { Maitento } from "@maitento/sdk";

// The challenge: a delete-note tool. Deploy the tutorial's project, then this folder's three files, which use its tools.
const mt = new Maitento();
await mt.deploy("../../maitento");
await mt.deploy("../maitento");

const notes = (await mt.vfs.findByName("notes")) ?? (await mt.vfs.create({ name: "notes" }));
const files = mt.vfs.open("notes");
await files.writeText("/old-ideas.md", "# Old ideas\n\n- a cat cafe\n");

const run = await mt.interactions.run("tidy-notes", { inputs: { request: "Delete my old ideas note.", notesVfsId: notes.id } });
console.log(run.output);

console.log(`\nDoes /old-ideas.md still exist? ${await files.exists("/old-ideas.md")}`);
