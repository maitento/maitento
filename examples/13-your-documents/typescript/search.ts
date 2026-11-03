import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
const handbook = (await mt.partitions.list()).find((p) => p.name === "handbook" && !p.isTemporary);
if (!handbook) throw new Error("Run setup.ts first.");

const query = process.argv[2] ?? "Can I take unused holiday into next year?";
console.log(`Searching for: ${query}\n`);

// The closest match comes first. Each result is a passage, with the name of the file it came from.
const results = await mt.files.search({ partitionId: handbook.id, query });
results.forEach((result, i) => console.log(`${i + 1}. ${result.name}: ${result.text.replace(/\s+/g, " ").slice(0, 70)}…`));
