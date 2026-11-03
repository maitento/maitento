import { readFile } from "node:fs/promises";
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();

// Upload the data and this folder's summarise.py, which adds revenue by region.
const files = mt.vfs.open("sales-data");
await files.writeText("/sales.csv", await readFile("../data/sales.csv", "utf8"));
await files.writeText("/summarise.py", await readFile("./summarise.py", "utf8"));

await mt.deploy("../maitento");

const run = await mt.capsules.run("sales-report");
console.log(`Capsule finished: ${run.status}\n`);
console.log(await files.readText("/report.md"));
