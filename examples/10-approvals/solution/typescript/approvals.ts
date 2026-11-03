import { createInterface } from "node:readline";
import { Maitento } from "@maitento/sdk";

// An approvals queue: every support run waiting for a person to approve a tool call, one at a time.
const mt = new Maitento();

const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
const ask = async (prompt: string): Promise<string> => {
  process.stdout.write(prompt);
  const line = await lines.next();
  return line.done ? "" : line.value;
};

const waiting = mt.runs.list({ types: ["Interaction"], statuses: ["PendingApproval"] });
for await (const summary of waiting) {
  if (summary.definitionName !== "support") continue;
  const run = await mt.interactionRuns.get(summary.id);
  const approval = run.pendingApproval;
  if (!approval) continue;

  console.log(`Run ${run.id}: ${approval.agentName} wants to call ${approval.functionName} with ${approval.argumentsJson}`);
  const answer = await ask("Approve? (y/n) ");
  if (answer.trim().toLowerCase().startsWith("y")) {
    await mt.interactionRuns.approve(run.id, { approvalId: approval.id });
  } else {
    const reason = await ask("Why not? ");
    await mt.interactionRuns.reject(run.id, { approvalId: approval.id, reason: reason || "Not approved" });
  }
}
console.log("Nothing else is waiting.");
process.exit(0);
