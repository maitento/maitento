import type { InteractionProcess, InteractionProcessContext } from "./models.js";

/** The kind of a transcript entry: the `context` array it came from (`agentMessage`, `toolCall`, …). */
export type TranscriptKind = keyof InteractionProcessContext | (string & {});

/** One item of an interaction run's conversation, tagged with its kind. */
export type TranscriptEntry = {
  [K in keyof InteractionProcessContext]: InteractionProcessContext[K][number] & { kind: K };
}[keyof InteractionProcessContext];

/**
 * The conversation of an interaction run in order: every item of `run.context` (agent and human messages, tool calls
 * and results, proposals, votes, …) merged and sorted by `sequence`, each tagged with its `kind`. Context arrays the
 * SDK does not know yet are included too.
 */
export function transcript(run: Pick<InteractionProcess, "context">): TranscriptEntry[] {
  const context = (run.context ?? {}) as unknown as Record<string, unknown>;
  const entries: Array<Record<string, unknown> & { kind: string; sequence: number }> = [];
  for (const [kind, items] of Object.entries(context)) {
    if (!Array.isArray(items)) continue;
    for (const item of items as unknown[]) {
      if (typeof item !== "object" || item === null) continue;
      const record = item as Record<string, unknown>;
      entries.push({ ...record, kind, sequence: typeof record.sequence === "number" ? record.sequence : 0 });
    }
  }
  entries.sort((a, b) => a.sequence - b.sequence);
  return entries as unknown as TranscriptEntry[];
}
