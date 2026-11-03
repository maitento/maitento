import { isTerminalStatus, Maitento, type InteractionProcess } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// One WebSocket to Maitento. Every change to your runs arrives over it.
const events = await mt.events.connect();

// Follow the run whose id you pass, or start a new one.
const id = process.argv[2] ?? (await mt.interactions.start("describe", { inputs: { place: "Lisbon" } })).id;
console.log(`Following run ${id}`);

// Say whenever the status changes, and finish once the run has ended. An event and a read-back can overtake each
// other, so anything older than the newest state already shown is ignored.
let latest: InteractionProcess | undefined;
let end!: (run: InteractionProcess) => void;
const ended = new Promise<InteractionProcess>((resolve) => (end = resolve));
const show = (run: InteractionProcess) => {
  if (latest && run.dateUpdated.getTime() < latest.dateUpdated.getTime()) return;
  if (run.status !== latest?.status) console.log(`\n[${run.status}]`);
  latest = run;
  if (isTerminalStatus(run.status)) end(run);
};

// The whole run, every time it changes.
events.on("interaction-process-updated", show, { id });

// The reply, a few words at a time, as the model writes it.
events.on("interaction-process-stream", (e) => {
  if (e.type === "Chat") process.stdout.write(e.stream);
}, { id });

// Events sent while the connection was down are lost, so read the run again when it comes back.
events.on("reconnected", async () => show(await mt.interactionRuns.get(id)));

// Events only tell you about changes from now on. The run may already have moved, or even ended: read it once now.
show(await mt.interactionRuns.get(id));

const run = await ended;
console.log(`Output: ${run.output?.length ?? 0} characters`);
await mt.close();
