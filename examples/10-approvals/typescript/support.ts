import { createInterface } from "node:readline";
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();

// The tools send the orders-api-key secret that tutorial 9's setup stored, so it must exist before the deploy.
if (!(await mt.secrets.findByName("orders-api-key"))) {
  throw new Error("Run tutorial 9's setup first: it stores the orders-api-key secret.");
}
await mt.deploy("../maitento");

const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
const ask = async (prompt: string): Promise<string> => {
  process.stdout.write(prompt);
  const line = await lines.next();
  return line.done ? "" : line.value;
};

const message = "Hi, order A-1001 arrived but the blue mug was smashed. Could I get a refund of 12.50 for it?";
console.log(`Customer: ${message}\n`);

const run = await mt.interactions.run("support", { inputs: { message } }, {
  // A refund needs your approval: the run waits with status PendingApproval until you decide.
  onWaiting: async (waiting) => {
    const approval = waiting.pendingApproval;
    if (waiting.status !== "PendingApproval" || !approval) return;

    console.log(`The agent wants to call ${approval.functionName} with ${approval.argumentsJson}`);
    const answer = await ask("Approve? (y/n) ");
    if (answer.trim().toLowerCase().startsWith("y")) {
      await mt.interactionRuns.approve(waiting.id, { approvalId: approval.id });
    } else {
      const reason = await ask("Why not? ");
      await mt.interactionRuns.reject(waiting.id, { approvalId: approval.id, reason: reason || "Not approved" });
    }
  },
});

console.log(`\nSupport: ${run.output}`);
process.exit(0);
