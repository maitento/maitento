import { Maitento, transcript } from "@maitento/sdk";

// Which shop the customer is writing to: the name of the secret holding its key.
const secretName = process.argv[2] ?? "second-shop-api-key";

const mt = new Maitento();
// A run takes the secret's id: never its value, which stays in Maitento.
const secret = await mt.secrets.getByName(secretName);

const message = "Hi, has my oak bookshelf (order B-2001) shipped yet?";
console.log(`Customer (${secretName}): ${message}\n`);

const run = await mt.interactions.run("support-any-shop", { inputs: { message, shopKey: secret.id } });

for (const entry of transcript(run)) {
  if (entry.kind === "toolResult") {
    const { result } = await mt.interactionRuns.toolResult(run.id, entry.sequence);
    console.log(`Tool result: ${result}`);
  }
}
console.log(`\nSupport: ${run.output}`);
