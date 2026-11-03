import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// region:run
// An editor hands work to a writer and a fact checker, then signs off the newsletter.
const run = await mt.interactions.run("newsletter", { inputs: { topic: "why sleep matters" } });
// endregion

// region:log
// Each piece of work the editor handed out is a Dispatch call on the run. Its result is the member's reply.
const firstLine = (text: string | null | undefined) => (text ?? "").split("\n").find((line) => line.trim()) ?? "";
for (const call of run.context.toolCall.filter((c) => c.functionName === "Dispatch")) {
  const { agent, message } = JSON.parse(call.argumentsJson) as { agent: string; message: string };
  console.log(`Editor -> ${agent}: ${firstLine(message).slice(0, 90)}`);
  const result = run.context.toolResult.find((r) => r.toolCallId === call.toolCallId);
  if (result) {
    const reply = await mt.interactionRuns.toolResult(run.id, result.sequence);
    console.log(`  ${firstLine(reply.result).slice(0, 100)}`);
  }
}
console.log(`\n${run.output}`);
// endregion
