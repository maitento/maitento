import { Maitento } from "@maitento/sdk";

const url = process.env.REPO_URL;
const credentials = process.env.REPO_CREDENTIALS;
if (!url || !credentials) throw new Error("Set REPO_URL and REPO_CREDENTIALS first.");

const request = process.argv[2] ?? "Add a --times option that prints the greeting that many times, with a test for it.";
const branch = process.argv[3] ?? "maitento/times-with-docs";

const mt = new Maitento();
// This folder's project: the tested-change-docs pipeline, whose hook adds a docs phase once the tests pass.
await mt.deploy("./maitento");

const run = await mt.pipelines.run("tested-change-docs", {
  inputs: { request },
  repos: [{ type: "http", name: "app", url, credentials, branchSource: "main", branchWork: branch }],
});

for (const phase of run.phases) {
  const steps = phase.steps.map((step) => `${step.agentName} ${step.stepName}${step.didCommit ? ", committed" : ""}`);
  const decision = phase.hookPostOutput ? ` -> ${JSON.parse(phase.hookPostOutput).decision}` : "";
  console.log(`${phase.phaseName}: ${phase.status} (${steps.join("; ")})${decision}`);
}
console.log(`\nPipeline ${run.status}. The work is on the ${branch} branch.`);
