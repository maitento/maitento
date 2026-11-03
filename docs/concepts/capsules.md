---
title: Capsules
description: Capsules are short-lived Linux sandboxes for running commands and scripts, with your files mounted.
sidebar:
  order: 14
---

# Capsules

A **capsule** is a recipe for a throwaway Linux machine: which packages to install, which users to create, which
[file systems](file-systems.md) and [secrets](secrets.md) to mount, and which commands to run when it starts.
Starting a capsule gives you that machine to run commands in. It ends when its commands finish, when you stop it, or
when it runs out of time.

Use capsules to run real code: crunch a CSV, build a project, convert files, call a command-line tool.

<!-- snippet: examples/21-sandboxes/maitento/capsules/sales-report.mtr -->
```hcl title="capsules/sales-report.mtr"
// A capsule is a short-lived Linux sandbox. This one mounts the sales-data file system,
// runs a Python script on the CSV in it, and stops when the script finishes.
autoTerminate = true
maxDuration = "00:05:00"

// The file system must exist before you deploy: create it and upload the data first.
vfs = [
  {
    vfs = @ref("sales-data")
    mountName = "data"
  }
]

startup = [
  {
    command = "python3"
    arguments = ["/mnt/data/summarise.py"]
    wait = true
    maxDuration = "00:02:00"
  }
]
```
<!-- /snippet -->

## Properties

| Property | What it does |
|---|---|
| `packages` | extra Debian packages to install with `apt`, for example `["jq", "sqlite3"]` |
| `users` | Linux users to create: `[ { name = "builder" } ]` |
| `vfs` | file systems to mount: each one appears at `/mnt/<mountName>` |
| `secrets` | secrets to mount: each one is written to the file `/mnt/secrets/<mountName>` |
| `startup` | commands to run in order: `[ { command arguments runAsUser maxDuration wait } ]` |
| `autoTerminate` | finish as soon as the startup commands are done |
| `maxDuration` | the longest it may live, as `"hh:mm:ss"` (10 minutes by default), counted from when it starts. A capsule still starting up then fails; a ready one finishes, and a command still running is stopped |

The machine already has Python 3, Node.js 22, .NET 8, Java 17, git, build tools, pandoc and ffmpeg.

## Running commands

A capsule without `autoTerminate` stays up and takes commands one at a time. Start it, send it commands, and stop it
when you're done. `execAndWait` sends a command and waits for it to end, then gives you its exit code and output.
This is the `workbench` capsule of [tutorial 21](../tutorials/21-sandboxes.md), which builds it step by step:

<!-- tabs -->
<!-- snippet: examples/21-sandboxes/typescript/commands.ts -->
```ts title="TypeScript"
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
```
<!-- /snippet -->
<!-- snippet: examples/21-sandboxes/python/commands.py -->
```python title="Python"
from maitento import Maitento

# Run sandbox.py first: the workbench capsule mounts the sales-data file system it creates.
mt = Maitento()
mt.deploy("../maitento")

# Start the workbench capsule. It stays up, so it can take commands one at a time.
capsule = mt.capsules.start("workbench")

# Run a command as the sandbox user, and wait for it to end. Each argument reaches the program as one word.
listing = mt.capsule_runs.exec_and_wait(capsule.id, "ls", ["-l", "/tmp/data"], run_as_user="sandbox")
print(f"exit code {listing.exit_code}\n{listing.output_standard}")

# A command that fails is a result too. The mounted file system belongs to the default user, so sandbox can't read it.
denied = mt.capsule_runs.exec_and_wait(capsule.id, "cat", ["/mnt/data/sales.csv"], run_as_user="sandbox")
print(f"exit code {denied.exit_code}\n{denied.output_error}")

mt.capsule_runs.terminate(capsule.id)
```
<!-- /snippet -->
<!-- snippet: examples/21-sandboxes/csharp/commands.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Capsules;
using Maitento.Sdk;

// Run sandbox.cs first: the workbench capsule mounts the sales-data file system it creates.
await using var mt = MaitentoClient.CreateFromEnvironment();
var ns = mt.DefaultNamespace ?? "tutorials";
await mt.DeployAsync("../maitento", ns);

// Start the workbench capsule. It stays up, so it can take commands one at a time.
var capsule = await mt.CapsuleProcesses.StartAsync(ns, "workbench", new CapsuleProcessStartRequest());

// Run a command as the sandbox user, and wait for it to end. Each argument reaches the program as one word.
var listing = await mt.CapsuleProcesses.RunCommandAndWaitAsync(capsule.Id, new CapsuleProcessRunCommandRequest
{
    Command = "ls",
    Arguments = ["-l", "/tmp/data"],
    RunAsUser = "sandbox",
});
Console.WriteLine($"exit code {listing.ExitCode}\n{listing.OutputStandard}");

// A command that fails is a result too. The mounted file system belongs to the default user, so sandbox can't read it.
var denied = await mt.CapsuleProcesses.RunCommandAndWaitAsync(capsule.Id, new CapsuleProcessRunCommandRequest
{
    Command = "cat",
    Arguments = ["/mnt/data/sales.csv"],
    RunAsUser = "sandbox",
});
Console.WriteLine($"exit code {denied.ExitCode}\n{denied.OutputError}");

await mt.CapsuleProcesses.TerminateAsync(capsule.Id);
```
<!-- /snippet -->
```bash title="CLI"
mt capsule-start workbench
mt capsule-exec <run id> ls --args "-l,/tmp/data" --user sandbox
mt capsule-command-await <run id> <command id>
mt capsule-terminate <run id>
```
<!-- /tabs -->

- **A command that fails is a result.** It comes back with status `Error` and its exit code; only a capsule that ends
  before the command does (stopped, or out of time) is an error: `CapsuleCommandAbortedError`.
- **`execAndWait` hears the end as it happens** when you have an [event stream](runs-and-events.md) open, and
  otherwise checks every second or two. In C# it's `CapsuleProcesses.RunCommandAndWaitAsync`, in Python
  `capsule_runs.exec_and_wait`.
- **`exec` only sends the command.** Use it to start something and read it later with `getCommand`. Pass
  `async: true` to let the capsule move on to the next command without waiting for this one.
- **You can send commands while the capsule is still starting.** They run, in order, once it's ready.
- **In an app,** `CapsuleExec` sends a command and `CapsuleCommandAwait` waits for it.

Each command records its exit code, its standard output and its error output. Of each output, the last 65,536
characters are kept; when there was more, `outputStandardFullLength` or `outputErrorFullLength` says how long it was.

## Good to know

- **Create file systems and secrets before you deploy** a capsule that mounts them.
- **Output from startup commands isn't kept.** Write results to a mounted file system, as the example does, or run
  the work as a command after start-up.
- **Each argument is one word, exactly as you give it.** Spaces, quotes and `$` in an argument reach the program
  unchanged, so `["hello   world"]` stays one argument. The command itself is shell text: to pipe or redirect, run
  `sh` with the arguments `["-c", "<your command line>"]`, or put the whole line in the command.
- **Secrets are readable by the default user only.** If you run commands as another user, copy the secret first.
- **Mounted file systems belong to the default user too** (`maitento`, mode `770`), so a command run as another user
  can't read them. Copy what that user needs somewhere it can read, as
  [tutorial 21](../tutorials/21-sandboxes.md#3-send-commands-to-a-capsule) does.
- **The default user is signed in to `mt` as you**, or as whoever started the capsule, with the capsule's namespace
  already set. `mt` is on its `PATH`, so a script in the capsule can call Maitento without a key of its own: read a
  file system, run an interaction, start another capsule. The sign-in lasts as long as the capsule, and can do
  anything you can. Run commands you don't trust, such as an agent's, as a user of their own, which isn't signed in.
