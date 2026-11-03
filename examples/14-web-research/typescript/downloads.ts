import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
const downloads = (await mt.partitions.list()).find((p) => p.name === "web-downloads" && p.isTemporary);
if (!downloads) throw new Error("Run research.ts first.");

// The newest files first. Each one is a page an agent read, with the run that read it.
const page = await mt.partitions.files(downloads.id, { limit: 5 });
for (const file of page.items) {
  console.log(`${file.webSource?.url}\n  read by run ${file.webSource?.processId}, deleted after ${file.expiresAt?.toISOString()}`);
}
