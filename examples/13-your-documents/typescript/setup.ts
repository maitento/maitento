import { readdirSync } from "node:fs";
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();

// A knowledge base for the handbook. Maitento's API calls a knowledge base a partition.
const partitions = await mt.partitions.list();
const handbook = partitions.find((p) => p.name === "handbook" && !p.isTemporary)
  ?? (await mt.partitions.create({ name: "handbook" }));

// Upload each document. Maitento reads its text. Uploading the same file again keeps one copy.
for (const name of readdirSync("../knowledge")) {
  await mt.files.upload(handbook.id, `../knowledge/${name}`);
  console.log(`Uploaded ${name}`);
}

// Indexing turns each document into embeddings, in the background. Wait until every file can be searched.
for (let attempt = 1; ; attempt++) {
  const files = [];
  for await (const file of mt.partitions.files(handbook.id)) files.push(file);
  const waiting = files.filter((f) => !f.isVectorGenerated).length;
  if (files.length > 0 && waiting === 0) break;
  if (attempt === 30) {
    // A file that can't be indexed until you act says why.
    const why = files.find((f) => f.indexingFailure)?.indexingFailure?.message ?? "Indexing needs an OpenAI model key.";
    throw new Error(`${waiting} files are still not indexed after a minute. ${why}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
console.log(`The handbook is indexed. Knowledge base id: ${handbook.id}`);
