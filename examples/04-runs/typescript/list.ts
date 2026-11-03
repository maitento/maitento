import { Maitento, type ProcessSummary } from "@maitento/sdk";

const mt = new Maitento();

// One line per run: when it started, what it ran, and how it is doing.
const show = (run: ProcessSummary) =>
  console.log(`${run.dateCreated.toISOString().slice(0, 19)}  ${run.definitionName}  ${run.status}`);

// Runs of every kind, newest first, a page at a time. Here: the runs in your namespace, five to a page.
const page = await mt.runs.list({ namespace: mt.namespace, limit: 5 });
page.items.forEach(show);

// The next page starts where this one ended. nextPage() is null after the last one.
const next = await page.nextPage();
if (next) {
  console.log("--- next page");
  next.items.forEach(show);
}
