import { Maitento } from "@maitento/sdk";

// The repository to work on, and credentials that can push to it, e.g. "x-access-token:<github token>".
const url = process.env.REPO_URL;
const credentials = process.env.REPO_CREDENTIALS;
if (!url || !credentials) throw new Error("Set REPO_URL and REPO_CREDENTIALS first.");

const mt = new Maitento();
await mt.deploy("../maitento");

const run = await mt.pipelines.run("add-feature", {
  inputs: { request: "Add a --shout flag that prints the greeting in capital letters, with a test for it." },
  repos: [{
    type: "http",
    name: "app",
    url,
    credentials,
    branchSource: "main",
    branchWork: "maitento/add-shout-flag",
  }],
});
console.log(`Pipeline ${run.status}. The work is on the maitento/add-shout-flag branch.\n`);

const diff = await mt.pipelineRuns.rawDiff(run.id);
console.log(diff?.diffRaw ?? "(no changes)");
