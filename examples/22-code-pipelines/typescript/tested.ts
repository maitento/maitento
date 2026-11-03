import { Maitento } from "@maitento/sdk";

// The repository to work on, and credentials that can push to it, e.g. "x-access-token:<github token>".
const url = process.env.REPO_URL;
const credentials = process.env.REPO_CREDENTIALS;
if (!url || !credentials) throw new Error("Set REPO_URL and REPO_CREDENTIALS first.");

// The change to make, and the branch to push it to.
const request = process.argv[2] ?? "Add a --times option that prints the greeting that many times, with a test for it.";
const branch = process.argv[3] ?? "maitento/add-times-option";

const mt = new Maitento();
await mt.deploy("../maitento");

const run = await mt.pipelines.run("tested-change", {
  inputs: { request },
  repos: [{ type: "http", name: "app", url, credentials, branchSource: "main", branchWork: branch }],
});

// region:phases
// Every phase that ran, including the ones the hook added, and what its post hook decided.
for (const phase of run.phases) {
  const steps = phase.steps.map((step) => `${step.agentName} ${step.stepName}${step.didCommit ? ", committed" : ""}`);
  const decision = phase.hookPostOutput ? ` -> ${JSON.parse(phase.hookPostOutput).decision}` : "";
  console.log(`${phase.phaseName}: ${phase.status} (${steps.join("; ")})${decision}`);
}
const variable = (name: string) => run.variables?.find((v) => v.name === name)?.value;
console.log(`\nTests passed: ${variable("testsPassed")}`);
console.log(`The last test report ends: ${(variable("testReport") ?? "").trim().split("\n").at(-1)}`);
console.log(`\nPipeline ${run.status}. The work is on the ${branch} branch.`);
// endregion
