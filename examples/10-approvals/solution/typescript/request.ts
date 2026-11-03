import { Maitento } from "@maitento/sdk";

// Starts a refund request and returns at once. The run waits for a person in the approvals queue.
const mt = new Maitento();
const message = "Hi, the tea sampler in order A-1001 was missing two of its teas. Could I get 5.00 back?";
const run = await mt.interactions.start("support", { inputs: { message } });
console.log(`Started run ${run.id}`);
