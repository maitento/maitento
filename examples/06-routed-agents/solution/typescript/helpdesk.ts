import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// Ask your own question with: node helpdesk.ts "your question"
const question = process.argv[2] ?? "When should I plant tulip bulbs?";

// The router hands the question to the specialist whose subject fits.
const run = await mt.interactions.run("ask-help-desk", { inputs: { question } });

// Each choice the router made is kept on the run: which agent took the turn, and why.
for (const decision of run.routingDecisions) {
  const chosen = await mt.agents.get(decision.chosen.id);
  const fallback = decision.isFallback ? " (fallback)" : "";
  console.log(`Router chose ${chosen.name}${fallback}: ${decision.reason}\n`);
}
console.log(run.output);
