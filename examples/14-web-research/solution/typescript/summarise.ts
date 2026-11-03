import { Maitento } from "@maitento/sdk";

// The challenge: summarise one page, with web search switched off for this run only.
const mt = new Maitento();
await mt.deploy("../../maitento");

const downloads = (await mt.partitions.list()).find((p) => p.name === "web-downloads" && p.isTemporary)
  ?? (await mt.partitions.create({ name: "web-downloads", isTemporary: true, fileLifetimeHours: 24 }));

const run = await mt.interactions.run("research", {
  inputs: { question: "Summarise https://en.wikipedia.org/wiki/Vasco_da_Gama_Tower in three sentences." },
  webDownloadPartitionId: downloads.id,
  // With no agentName, the override applies to every agent in the run. Fetching stays on.
  webAccessOverrides: [{ search: false }],
});
console.log(run.output);

console.log("\nWhat the agent did:");
for (const call of run.context.toolCall) console.log(`- ${call.functionName} ${call.argumentsJson}`);
