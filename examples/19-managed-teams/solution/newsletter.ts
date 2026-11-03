import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("./maitento");

// The editor now has a headline writer too.
const run = await mt.interactions.run("newsletter", { inputs: { topic: "why sleep matters" } });

const dispatches = run.context.toolCall.filter((c) => c.functionName === "Dispatch");
const members = dispatches.map((c) => (JSON.parse(c.argumentsJson) as { agent: string }).agent);
console.log(`The editor handed out work ${dispatches.length} times: ${members.join(", ")}\n`);
console.log(run.output);
