import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
const userName = process.argv[2] ?? "Ana";

// The interaction made one loom per person, named "<interaction>/<seat>/<input value>".
const loom = (await mt.looms.list()).find((l) => l.name === `wren-chat/Wren/${userName}`);
if (!loom) {
  console.log(`Wren has no memory of ${userName} yet.`);
  process.exit(0);
}

// region:threads
// Each thing Wren remembers is a thread.
console.log(`Threads in ${loom.name}:`);
for (const thread of await mt.looms.threads(loom.id)) console.log(`- [${thread.kind}] ${thread.content}`);
// endregion

// region:tapestry
// What Wren will wake up knowing in its next conversation with this person: the "What You Know" in its instructions.
const tapestry = await mt.looms.tapestry(loom.id, { subjects: [userName], agentName: "Wren" });
console.log(`\n${tapestry.text}`);
// endregion
