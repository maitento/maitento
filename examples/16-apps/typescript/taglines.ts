import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// Run the taglines app. Its main(string product) parameter is its one input.
const product = process.argv[2] ?? "a reusable bamboo coffee cup";
const run = await mt.apps.run("taglines", { inputs: { product } });

// What the app printed, what it returned, and its named output.
for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nReturned: ${run.returnValue}`);
console.log(`Output "taglines": ${run.outputs.find((output) => output.name === "taglines")?.value}`);
