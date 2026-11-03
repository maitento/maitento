import { Maitento } from "@maitento/sdk";

// The challenge: the same assistant, over a second knowledge base. The project doesn't change.
const mt = new Maitento();
await mt.deploy("../../maitento");

const itPolicies = (await mt.partitions.list()).find((p) => p.name === "it-policies" && !p.isTemporary)
  ?? (await mt.partitions.create({ name: "it-policies" }));
await mt.files.upload(itPolicies.id, "../knowledge/it-security.md");

// Wait until the document is indexed.
for (let attempt = 1; ; attempt++) {
  const files = [];
  for await (const file of mt.partitions.files(itPolicies.id)) files.push(file);
  if (files.length > 0 && files.every((f) => f.isVectorGenerated)) break;
  if (attempt === 30) throw new Error("The document is still not indexed after a minute.");
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

// The same interaction as before. Only the knowledge base in partitionId is different.
const run = await mt.interactions.run("ask-handbook", {
  inputs: { question: "How often do I have to change my password?", partitionId: itPolicies.id },
});
console.log(run.output);
