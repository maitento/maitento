import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

const handbook = (await mt.partitions.list()).find((p) => p.name === "handbook" && !p.isTemporary);
if (!handbook) throw new Error("Run setup.ts first.");

const question = process.argv[2] ?? "I didn't use all my holiday last year. How much can I carry over, and until when?";

// partitionId goes straight into the search tool's request. The model only writes the query.
const run = await mt.interactions.run("ask-handbook", { inputs: { question, partitionId: handbook.id } });
console.log(run.output);
