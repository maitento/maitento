// Tutorial 4's challenge: start three runs at once, then wait for all of them.
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// start() doesn't wait, so all three runs are handed to Maitento straight away.
const topics = ["why the sky is blue", "how bees make honey", "what a black hole is"];
const runs = await Promise.all(topics.map((topic) => mt.interactions.start("explain", { inputs: { topic } })));
const ids = runs.map((run) => run.id);
console.log(`Started ${ids.length} runs`);

// One call reads all three: runs.list() with their ids. Say how many have ended whenever that changes.
let ended = 0;
while (ended < ids.length) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const page = await mt.runs.list({ ids });
  const now = page.items.filter((run) => run.state === "Terminal").length;
  if (now !== ended) console.log(`${now} of ${ids.length} ended`);
  ended = now;
}

for (const [i, id] of ids.entries()) {
  const run = await mt.interactionRuns.get(id);
  console.log(`${topics[i]}: ${run.status}, ${run.output?.length ?? 0} characters`);
}
