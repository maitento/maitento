import { Maitento } from "@maitento/sdk";

// Run sandbox.ts first: the workbench capsule mounts the sales-data file system it creates.
const mt = new Maitento();
await mt.deploy("../maitento");

// Start the workbench capsule. It stays up, so it can take commands one at a time.
const capsule = await mt.capsules.start("workbench");

// Run a command as the sandbox user, and wait for it to end. Each argument reaches the program as one word.
const listing = await mt.capsuleRuns.execAndWait(capsule.id, {
  command: "ls",
  arguments: ["-l", "/tmp/data"],
  runAsUser: "sandbox",
});
console.log(`exit code ${listing.exitCode}\n${listing.outputStandard}`);

// A command that fails is a result too. The mounted file system belongs to the default user, so sandbox can't read it.
const denied = await mt.capsuleRuns.execAndWait(capsule.id, {
  command: "cat",
  arguments: ["/mnt/data/sales.csv"],
  runAsUser: "sandbox",
});
console.log(`exit code ${denied.exitCode}\n${denied.outputError}`);

await mt.capsuleRuns.terminate(capsule.id);
