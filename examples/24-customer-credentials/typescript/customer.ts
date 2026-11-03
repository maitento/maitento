import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// One customer, Acme, brings its own DeepSeek key. Everything made for it carries its tag.
const customer = "acme";
const key = process.env.CUSTOMER_DEEPSEEK_API_KEY;
if (!key) throw new Error("Set CUSTOMER_DEEPSEEK_API_KEY to the customer's DeepSeek key.");

// Start from nothing: remove what an earlier run of this script made.
for (const old of await mt.credentialStacks.list())
  if (old.name === `customer-${customer}`) await mt.credentialStacks.delete(old.id);
await mt.credentials.deleteByTag(customer);

// The customer's key, as a credential tagged with the customer.
const credential = await mt.credentials.create({
  name: `${customer} DeepSeek`,
  provider: "DeepSeek",
  keys: [{ value: key }],
  tag: customer,
});
console.log(`Credential "${credential.name}", key ending ${credential.keys[0].keyHint}`);

// A stack for the customer, holding just that credential.
const stack = await mt.credentialStacks.create({
  name: `customer-${customer}`,
  entries: [{ credentialId: credential.id }],
});

// The customer's run, on the customer's stack.
const run = await mt.interactions.run("summarise", {
  inputs: { text: "Our order arrived two days late and one box was damaged, but support sent a replacement at once." },
  credentialStack: stack.name,
});
console.log(run.output);
console.log(`Ran on stack "${run.credentialStack?.stackName}", chosen at the ${run.credentialStack?.source}`);
