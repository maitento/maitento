import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// Pages the agent reads are kept for a day in a temporary knowledge base. Make one once and reuse it.
const partitions = await mt.partitions.list();
const downloads = partitions.find((p) => p.name === "web-downloads" && p.isTemporary)
  ?? (await mt.partitions.create({ name: "web-downloads", isTemporary: true, fileLifetimeHours: 24 }));

const question = process.argv[2] ?? "What is the tallest building in Lisbon, and how tall is it?";
const run = await mt.interactions.run("research", { inputs: { question }, webDownloadPartitionId: downloads.id });
console.log(run.output);

// Every search and every page read is a tool call in the run.
console.log("\nWhat the agent did:");
for (const call of run.context.toolCall) console.log(`- ${call.functionName} ${call.argumentsJson}`);
