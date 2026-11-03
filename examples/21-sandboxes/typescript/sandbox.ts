import { readFile } from "node:fs/promises";
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();

// The capsule mounts the sales-data file system, so create it (and the namespace) before deploying.
const namespace = process.env.MAITENTO_NAMESPACE ?? "tutorials";
if (!(await mt.namespaces.find(namespace))) await mt.namespaces.create({ name: namespace });
if (!(await mt.vfs.findByName("sales-data"))) await mt.vfs.create({ name: "sales-data" });

const files = mt.vfs.open("sales-data");
for (const name of ["sales.csv", "summarise.py"]) {
  await files.writeText(`/${name}`, await readFile(`../data/${name}`, "utf8"));
}

await mt.deploy("../maitento");

// Start the capsule and wait for it: it runs summarise.py and stops.
const run = await mt.capsules.run("sales-report");
console.log(`Capsule finished: ${run.status}\n`);

console.log(await files.readText("/report.md"));
