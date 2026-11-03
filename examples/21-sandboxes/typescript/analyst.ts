import { Maitento } from "@maitento/sdk";

// Run sandbox.ts first: the workbench capsule mounts the sales-data file system it creates.
const mt = new Maitento();
await mt.deploy("../maitento");

// The app starts the workbench capsule, then lets the analyst run commands in it until it can answer.
const run = await mt.apps.run("analyst", {
  inputs: {
    question: process.argv[2] ?? "Which region brought in the most revenue, and how much?",
    namespaceName: process.env.MAITENTO_NAMESPACE ?? "tutorials",
  },
});

for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nAnswer: ${run.returnValue}`);
