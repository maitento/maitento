---
title: 21. Sandboxes
description: Run a Python script on your data in a throwaway Linux machine, then let an agent run its own commands there.
sidebar:
  order: 21
---

# 21. Sandboxes

Agents are good at deciding what to do, and bad at arithmetic. A sandbox gives them a real machine to do it on. First
you'll run a Python script on a sales CSV in a throwaway Linux machine and read the report it writes. Then you'll hand
the keyboard to an agent: it decides which commands to run, sees what each one prints, and answers a question about
the data. You'll also see what an agent does when a command fails.

> **You'll learn**
>
> - capsules: throwaway Linux machines with your files mounted
> - running a script in one and getting its results back
> - sending commands to a capsule that stays up, and getting each one's exit code and output
> - letting an agent choose commands and read their output and exit codes
> - installing packages, and keeping an agent's commands away from your Maitento login
>
> **New concepts:** [capsules (sandboxes)](../concepts/capsules.md) ·
> **Builds on:** [15. Files for agents](15-files-for-agents.md) and [16. Apps](16-apps.md) ·
> **Time:** about 30 minutes ·
> **Cost:** under $0.01 per question to the analyst on DeepSeek ·
> **Needs:** nothing beyond the [tutorials' setup](index.md#before-you-start)

In Maitento a sandbox is a **capsule**: a recipe for a Linux machine (what to install, which file systems to mount,
what to run when it starts). Starting a capsule gives you that machine, until its commands finish, you stop it, or it
runs out of time.

## 1. The project

The data and a Python script go into a [file system](15-files-for-agents.md) called `sales-data`:

<!-- snippet: examples/21-sandboxes/data/summarise.py -->
```python title="data/summarise.py"
# Runs inside the capsule. The VFS is mounted at /mnt/data, so files you put in it
# are right there, and anything written back to it is still there after the capsule ends.
import csv
from collections import defaultdict

totals = defaultdict(float)
units = defaultdict(int)
with open("/mnt/data/sales.csv", newline="") as f:
    for row in csv.DictReader(f):
        totals[row["product"]] += int(row["units"]) * float(row["unit_price"])
        units[row["product"]] += int(row["units"])

lines = ["# Sales report", "", "| Product | Units | Revenue |", "|---|---:|---:|"]
for product, revenue in sorted(totals.items(), key=lambda item: -item[1]):
    lines.append(f"| {product} | {units[product]} | {revenue:.2f} |")
lines += ["", f"Total revenue: {sum(totals.values()):.2f}"]

with open("/mnt/data/report.md", "w") as f:
    f.write("\n".join(lines) + "\n")
print("Wrote /mnt/data/report.md")
```
<!-- /snippet -->

The `sales-report` capsule mounts that file system at `/mnt/data`, runs the script, and stops when it's done:

<!-- snippet: examples/21-sandboxes/maitento/capsules/sales-report.mtr -->
```hcl title="maitento/capsules/sales-report.mtr"
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

**Done when:** you can say where the script finds the CSV (`/mnt/data/sales.csv`) and where it writes the report.

## 2. Run the report

A file system has to exist before a capsule that mounts it is deployed, so the script creates `sales-data` and
uploads the files first. Run it from `examples/21-sandboxes/typescript`, `python` or `csharp`, as in
[tutorial 1](01-hello-agent.md#run-it):

<!-- tabs -->
<!-- snippet: examples/21-sandboxes/typescript/sandbox.ts -->
```ts title="TypeScript"
import { readFile } from "node:fs/promises";
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();

// The capsule mounts the sales-data file system, so create it (and the namespace) before deploying.
const namespace = process.env.MAITENTO_NAMESPACE ?? "tutorials";
if (!(await mt.namespaces.find(namespace))) await mt.namespaces.create({ name: namespace });
if (!(await mt.vfs.findByName("sales-data"))) await mt.vfs.create({ name: "sales-data" });

const files = mt.vfs.open("sales-data");
for (const name of ["sales.csv", "summarise.py"]) {
  await files.writeText(`/${name}`, await readFile(`../data/${name}`, "utf8"));
}

await mt.deploy("../maitento");

// Start the capsule and wait for it: it runs summarise.py and stops.
const run = await mt.capsules.run("sales-report");
console.log(`Capsule finished: ${run.status}\n`);

console.log(await files.readText("/report.md"));
```
<!-- /snippet -->
<!-- snippet: examples/21-sandboxes/python/sandbox.py -->
```python title="Python"
import os
from pathlib import Path

from maitento import Maitento

mt = Maitento()

# The capsule mounts the sales-data file system, so create it (and the namespace) before deploying.
namespace = os.environ.get("MAITENTO_NAMESPACE", "tutorials")
if not mt.namespaces.find(namespace):
    mt.namespaces.create(namespace)
if not mt.vfs.find_by_name("sales-data"):
    mt.vfs.create("sales-data")

files = mt.vfs.open("sales-data")
for name in ["sales.csv", "summarise.py"]:
    files.write_text(f"/{name}", Path("../data", name).read_text(encoding="utf-8"))

mt.deploy("../maitento")

# Start the capsule and wait for it: it runs summarise.py and stops.
run = mt.capsules.run("sales-report")
print(f"Capsule finished: {run.status}\n")

print(files.read_text("/report.md"))
```
<!-- /snippet -->
<!-- snippet: examples/21-sandboxes/csharp/sandbox.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();

// The capsule mounts the sales-data file system, so create it (and the namespace) before deploying.
var ns = mt.DefaultNamespace ?? "tutorials";
if (await mt.Namespaces.GetByNameAsync(ns) == null) await mt.Namespaces.CreateAsync(ns);
var salesData = await mt.VirtualFileSystems.GetByNameAsync(ns, "sales-data")
    ?? await mt.VirtualFileSystems.CreateAsync(ns, "sales-data");

foreach (var name in new[] { "sales.csv", "summarise.py" })
{
    var text = await File.ReadAllTextAsync($"../data/{name}");
    await mt.VirtualFileSystems.WriteTextById(salesData.Id, $"/{name}", text);
}

await mt.DeployAsync("../maitento", ns);

// Start the capsule and wait for it: it runs summarise.py and stops.
var run = await mt.Capsules.RunAsync(ns, "sales-report");
Console.WriteLine($"Capsule finished: {run.Status}\n");

Console.WriteLine(await mt.VirtualFileSystems.ReadTextById(salesData.Id, "/report.md"));
```
<!-- /snippet -->
```bash title="CLI"
mt namespace-create tutorials
mt vfs-create sales-data
mt cp data/sales.csv /vfs/sales-data@tutorials/sales.csv
mt cp data/summarise.py /vfs/sales-data@tutorials/summarise.py
mt deploy ./maitento
mt capsule-start sales-report
mt cat /vfs/sales-data@tutorials/report.md
```
<!-- /tabs -->

```text
Capsule finished: Finished

# Sales report

| Product | Units | Revenue |
|---|---:|---:|
| Desk lamp | 10 | 599.00 |
| Tea sampler | 43 | 516.00 |
| Blue mug | 44 | 374.00 |

Total revenue: 1489.00
```

The capsule started, mounted `sales-data`, ran `python3 /mnt/data/summarise.py`, and stopped. The report outlived
it, because it was written to the mounted file system.

**Done when:** you see the report, and the capsule finished with status `Finished`.

## 3. Send commands to a capsule

`sales-report` did all its work as it started, then stopped. A capsule can also stay up and take commands one at a
time, which is what an agent will need. That's the `workbench` capsule:

<!-- snippet: examples/21-sandboxes/maitento/capsules/workbench.mtr -->
```hcl title="maitento/capsules/workbench.mtr"
// A capsule that stays up (no autoTerminate), so commands can be sent to it one at a time.
maxDuration = "00:10:00"

vfs = [
  {
    vfs = @ref("sales-data")
    mountName = "data"
  }
]

// The commands the agent chooses run as this user. The capsule's default user is signed in to
// Maitento as you, and an agent's commands don't need that.
users = [
  {
    name = "sandbox"
  }
]

// A mounted file system is for the default user only, so give the sandbox user a copy it can read.
startup = [
  {
    command = "bash"
    arguments = ["-c", "rm -rf /tmp/data && cp -r /mnt/data /tmp/data && chmod -R a+rwX /tmp/data"]
    wait = true
    maxDuration = "00:01:00"
  }
]
```
<!-- /snippet -->

- With no `autoTerminate`, it stays up until it's stopped or its `maxDuration` runs out.
- It creates a second user, `sandbox`, for commands that shouldn't run as you. The reason is
  [below](#inside-a-capsule-mt-is-signed-in-as-you).
- A mounted file system belongs to the capsule's default user, so the start-up command copies the data to
  `/tmp/data`, where `sandbox` can read it.

`commands.ts` starts `workbench`, runs two commands in it as `sandbox`, and stops it:

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

```text
exit code 0
total 12
-rw-rw-rw- 1 maitento maitento 171 Oct 27 10:31 report.md
-rw-rw-rw- 1 maitento maitento 398 Oct 27 10:31 sales.csv
-rw-rw-rw- 1 maitento maitento 915 Oct 27 10:31 summarise.py

exit code 1
cat: /mnt/data/sales.csv: Permission denied
```

- **`execAndWait`** (`exec_and_wait` in Python, `RunCommandAndWaitAsync` in C#) sends a command and waits for it to
  end. It returns the command with its `exitCode`, `outputStandard` and `outputError`. With an
  [event stream](../concepts/runs-and-events.md) open it hears the end as it happens; without one it checks every
  second or two.
- **A command that fails isn't an error.** `cat` exited with 1 and said why in its error output. Your code reads the
  exit code, and so will the agent.
- **You don't wait for the capsule to start.** A command sent while it's starting runs as soon as it's ready.
- **If the capsule ends first,** because it was stopped or ran out of time, `execAndWait` throws
  `CapsuleCommandAbortedError`, saying why.

**Done when:** you see the files in `/tmp/data`, then exit code 1 and `Permission denied` for `/mnt/data`.

## 4. An agent in the sandbox

Now let an agent drive. The question is "Which region brought in the most revenue, and how much?", and the report
doesn't say. Nobody tells the agent how to work it out: it looks at the files, writes a command, reads what it
prints, and carries on until it can answer.

The loop lives in an [app](16-apps.md). Each step, it asks the agent for the next command, runs it in a capsule, and
adds the command, its exit code and its output to what the agent sees next time:

<!-- snippet: examples/21-sandboxes/maitento/apps/analyst/analyst.mtc -->
```c title="maitento/apps/analyst/analyst.mtc"
// An agent works in a sandbox: it chooses each command, the app runs it in a capsule and hands
// back what it printed, until the agent can answer.
string main(string question, string namespaceName) {
	guid capsuleId = CapsuleStart("workbench", namespaceName, "[]", "[]", "[]");
	jsonObject capsule = CapsuleWaitUntilStarted(capsuleId);
	if (JsonObjectGet(capsule, "status") != "Running") {
		throw("The capsule did not start: " + JsonObjectGet(capsule, "failureDetails"));
	}

	string transcript = "";
	string answer = "";
	for (int step = 1; step <= 6; step++) {
		// Ask the analyst for the next command, with everything it has run so far.
		jsonObject inputs = JsonObjectCreate();
		inputs = JsonObjectSetString(inputs, "question", question);
		inputs = JsonObjectSetString(inputs, "transcript", transcript);
		jsonObject run = InteractionAwait(InteractionStart("next-command", inputs, "[]", "[]", ""));
		if (JsonObjectGet(run, "status") != "Finished") {
			CapsuleTerminate(capsuleId);
			throw("The analyst failed: " + JsonObjectGet(run, "failureDetails"));
		}
		jsonObject next = StringToJsonObject(JsonObjectGet(run, "output"));
		if (JsonObjectGet(next, "done") == "true") {
			answer = JsonObjectGet(next, "answer");
			break;
		}

		// Run the command in the capsule as the sandbox user, and wait for it to end.
		string command = JsonObjectGet(next, "command");
		guid commandId = CapsuleExec(capsuleId, command, "[]", "sandbox", 60000, false);
		jsonObject result = CapsuleCommandAwait(capsuleId, commandId);
		string output = "$ " + command + "\nexit code: " + JsonObjectGet(result, "exitCode") + "\n"
			+ JsonObjectGet(result, "outputStandard") + JsonObjectGet(result, "outputError");
		PrintLine(output);
		transcript = transcript + output + "\n";
	}

	CapsuleTerminate(capsuleId);
	AppStateSetOutputString("answer", answer);
	return(answer);
}
```
<!-- /snippet -->

- **`CapsuleStart`** starts the capsule, and **`CapsuleWaitUntilStarted`** waits until it's running.
- **`CapsuleExec`** queues a command and returns its id. **`CapsuleCommandAwait`** waits for it to end, and returns
  its `exitCode`, `outputStandard` and `outputError`. Together they do what `execAndWait` did in step 3.
- **`next-command`** is a one-shot interaction with a [typed answer](03-typed-answers.md): `done`, `command` and
  `answer`.

This is what you did by hand in step 3, from inside Maitento: the app uses the same `workbench` capsule, and the
agent's commands run as `sandbox`, as yours did.

The agent sees the question and the commands so far:

<!-- snippet: examples/21-sandboxes/maitento/prompts/next-command.md -->
```md title="maitento/prompts/next-command.md"
Answer this question about the files in /tmp/data: %%question%%

{{#if transcript}}
The commands you have run so far, each with its exit code and output:

%%transcript%%
{{/if}}

Give the next bash command to run. When you can answer the question, set done to true and give the answer instead.
```
<!-- /snippet -->

Why an app, and not a [tool](08-first-tool.md) the agent calls? Tools that call Maitento itself
(`auth = "Maitento"`, as in [tutorial 15](15-files-for-agents.md)) can read and write files, but they can't start
capsules or run commands in them. An app can, and it also keeps the loop in one place: how many steps, which user,
when to stop.

**Done when:** you can say who chooses each command (the agent), and who runs it (the app).

## 5. Ask the analyst

`analyst.ts` deploys the project and runs the app with the question. Run `sandbox.ts` first, because `workbench`
mounts the file system it creates:

<!-- tabs -->
<!-- snippet: examples/21-sandboxes/typescript/analyst.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

// Run sandbox.ts first: the workbench capsule mounts the sales-data file system it creates.
const mt = new Maitento();
await mt.deploy("../maitento");

// The app starts the workbench capsule, then lets the analyst run commands in it until it can answer.
const run = await mt.apps.run("analyst", {
  inputs: {
    question: process.argv[2] ?? "Which region brought in the most revenue, and how much?",
    namespaceName: process.env.MAITENTO_NAMESPACE ?? "tutorials",
  },
});

for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nAnswer: ${run.returnValue}`);
```
<!-- /snippet -->
<!-- snippet: examples/21-sandboxes/python/analyst.py -->
```python title="Python"
import os
import sys

from maitento import Maitento

# Run sandbox.py first: the workbench capsule mounts the sales-data file system it creates.
mt = Maitento()
mt.deploy("../maitento")

question = sys.argv[1] if len(sys.argv) > 1 else "Which region brought in the most revenue, and how much?"

# The app starts the workbench capsule, then lets the analyst run commands in it until it can answer.
run = mt.apps.run(
    "analyst",
    inputs={"question": question, "namespaceName": os.environ.get("MAITENTO_NAMESPACE", "tutorials")},
)

for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nAnswer: {run.return_value}")
```
<!-- /snippet -->
<!-- snippet: examples/21-sandboxes/csharp/analyst.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

// Run sandbox.cs first: the workbench capsule mounts the sales-data file system it creates.
await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// The app starts the workbench capsule, then lets the analyst run commands in it until it can answer.
var run = await mt.Apps.RunAsync("analyst", new Dictionary<string, string>
{
    ["question"] = args.Length > 0 ? args[0] : "Which region brought in the most revenue, and how much?",
    ["namespaceName"] = mt.DefaultNamespace ?? "tutorials",
});

foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nAnswer: {run.ReturnValue}");
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt app-run analyst --input-question "Which region brought in the most revenue, and how much?" --input-namespacename tutorials
```
<!-- /tabs -->

```text
$ ls -la /tmp/data
exit code: 0
total 20
drwxrwxrwx 2 maitento maitento 4096 Oct 26 20:31 .
drwxrwxrwt 1 root     root     4096 Oct 26 20:31 ..
-rw-rw-rw- 1 maitento maitento  171 Oct 26 20:31 report.md
-rw-rw-rw- 1 maitento maitento  398 Oct 26 20:31 sales.csv
-rw-rw-rw- 1 maitento maitento  915 Oct 26 20:31 summarise.py
$ cat /tmp/data/sales.csv; echo '---'; cat /tmp/data/report.md
exit code: 0
date,region,product,units,unit_price
2026-09-01,North,Blue mug,12,8.50
…
$ awk -F, 'NR>1{r[$2]+=$4*$5} END{for(k in r) printf "%s %.2f\n", k, r[k]}' /tmp/data/sales.csv
exit code: 0
West 527.00
South 415.20
North 546.80

Answer: The North region brought in the most revenue, at 546.80 (West: 527.00, South: 415.20).
```

It takes a minute or so, most of it the agent choosing each command: a command's result is back moments after it
ends. Every run takes its own path, with different commands, but the same answer.

**Done when:** the answer is North, 546.80.

## 6. Break it on purpose: a command that fails

Ask for something the machine can't do. The `sqlite3` command-line tool isn't installed:

```bash
node analyst.ts "Use the sqlite3 command-line tool to find which product sold the most units."
```

```text
$ cd /tmp/data && sqlite3 :memory: ".mode csv" ".import sales.csv sales" "SELECT product, SUM(units) AS total FROM sales GROUP BY product ORDER BY total DESC LIMIT 3;"
exit code: 127
-bash: line 1: sqlite3: command not found
$ cd /tmp/data && python3 -c "import sqlite3,csv;c=sqlite3.connect(':memory:');c.execute('CREATE TABLE sales(date,region,product,units,unit_price)');r=csv.reader(open('sales.csv'));next(r);c.executemany('INSERT INTO sales VALUES(?,?,?,?,?)',r);print(c.execute('SELECT product,SUM(units) t FROM sales GROUP BY product ORDER BY t DESC').fetchall())"
exit code: 0
[('Blue mug', 44), ('Tea sampler', 43), ('Desk lamp', 10)]

Answer: The sqlite3 command-line tool is not installed in this environment, so the query was executed via Python's built-in sqlite3 module instead. The product that sold the most units is the Blue mug, with 44 units. (Tea sampler: 43, Desk lamp: 10.)
```

The command failed with exit code 127, the shell's "command not found", and its error output said why. A failed
command isn't a failed run: the app passed the exit code and the error back like any other output, and the agent
read them and found another way, Python's own `sqlite3` module.

Now fix it the proper way. Add a line to `workbench.mtr`, after `maxDuration`, and ask again:

```hcl
packages = ["sqlite3"]
```

This time `sqlite3` runs: the capsule installs Debian packages as it starts. Exit codes keep helping, too. In our run
the agent's first query failed with exit code 1 and `table sales already exists`; it read the error and fixed the
query on the next step.

**Done when:** you've seen exit code 127 in the transcript, and after adding the package, an answer that used
`sqlite3` itself.

## Inside a capsule, `mt` is signed in as you

When a capsule starts, Maitento signs its default user, `maitento`, in to the [`mt` command line](index.md#running-the-code) as
the user who started the capsule, with the capsule's namespace already set. A script in the sandbox can call
Maitento without a key of its own: read a file system, start an interaction, start another capsule. `mt` is on the
default user's `PATH`, for example:

```bash
mt interaction-run <interaction> --input-<name> "<value>"
```

The sign-in is made for that capsule, and is switched off when it ends. While it runs, though, it can do anything you
can. That's why the analyst's commands run as `sandbox`, a user the capsule creates, which isn't signed in: an agent
choosing commands shouldn't be able to act as you. The price is that a mounted file system belongs to the default
user (mode `770`), so `workbench`'s start-up command copies the data to `/tmp/data` for `sandbox` to read.

## All the files

Every file in this tutorial's project:

<!-- project: examples/21-sandboxes -->
**On GitHub:** [`examples/21-sandboxes`](https://github.com/maitento/maitento/tree/main/examples/21-sandboxes) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/21-sandboxes/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/21-sandboxes/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/21-sandboxes/csharp)

<details>
<summary>All the files in this project (10)</summary>

<!-- tabs: files -->
**`maitento/agents/analyst.mtr`**
```hcl title="maitento/agents/analyst.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You answer questions about data by running bash commands in a Linux sandbox, one at a time, and reading what they print. Python 3 is installed. Keep each command's output short."
summary = "Answers questions about data by running commands in a sandbox"
```

**`maitento/apps/analyst/analyst.mtc`**
```c title="maitento/apps/analyst/analyst.mtc"
// An agent works in a sandbox: it chooses each command, the app runs it in a capsule and hands
// back what it printed, until the agent can answer.
string main(string question, string namespaceName) {
	guid capsuleId = CapsuleStart("workbench", namespaceName, "[]", "[]", "[]");
	jsonObject capsule = CapsuleWaitUntilStarted(capsuleId);
	if (JsonObjectGet(capsule, "status") != "Running") {
		throw("The capsule did not start: " + JsonObjectGet(capsule, "failureDetails"));
	}

	string transcript = "";
	string answer = "";
	for (int step = 1; step <= 6; step++) {
		// Ask the analyst for the next command, with everything it has run so far.
		jsonObject inputs = JsonObjectCreate();
		inputs = JsonObjectSetString(inputs, "question", question);
		inputs = JsonObjectSetString(inputs, "transcript", transcript);
		jsonObject run = InteractionAwait(InteractionStart("next-command", inputs, "[]", "[]", ""));
		if (JsonObjectGet(run, "status") != "Finished") {
			CapsuleTerminate(capsuleId);
			throw("The analyst failed: " + JsonObjectGet(run, "failureDetails"));
		}
		jsonObject next = StringToJsonObject(JsonObjectGet(run, "output"));
		if (JsonObjectGet(next, "done") == "true") {
			answer = JsonObjectGet(next, "answer");
			break;
		}

		// Run the command in the capsule as the sandbox user, and wait for it to end.
		string command = JsonObjectGet(next, "command");
		guid commandId = CapsuleExec(capsuleId, command, "[]", "sandbox", 60000, false);
		jsonObject result = CapsuleCommandAwait(capsuleId, commandId);
		string output = "$ " + command + "\nexit code: " + JsonObjectGet(result, "exitCode") + "\n"
			+ JsonObjectGet(result, "outputStandard") + JsonObjectGet(result, "outputError");
		PrintLine(output);
		transcript = transcript + output + "\n";
	}

	CapsuleTerminate(capsuleId);
	AppStateSetOutputString("answer", answer);
	return(answer);
}
```

**`maitento/apps/analyst/analyst.mtr`**
```hcl title="maitento/apps/analyst/analyst.mtr"
// Stop the app if it runs for more than ten minutes.
duration.max = "00:10:00"
```

**`maitento/capsules/sales-report.mtr`**
```hcl title="maitento/capsules/sales-report.mtr"
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

**`maitento/capsules/workbench.mtr`**
```hcl title="maitento/capsules/workbench.mtr"
// A capsule that stays up (no autoTerminate), so commands can be sent to it one at a time.
maxDuration = "00:10:00"

vfs = [
  {
    vfs = @ref("sales-data")
    mountName = "data"
  }
]

// The commands the agent chooses run as this user. The capsule's default user is signed in to
// Maitento as you, and an agent's commands don't need that.
users = [
  {
    name = "sandbox"
  }
]

// A mounted file system is for the default user only, so give the sandbox user a copy it can read.
startup = [
  {
    command = "bash"
    arguments = ["-c", "rm -rf /tmp/data && cp -r /mnt/data /tmp/data && chmod -R a+rwX /tmp/data"]
    wait = true
    maxDuration = "00:01:00"
  }
]
```

**`maitento/interactions/one-shot/next-command.mtr`**
```hcl title="maitento/interactions/one-shot/next-command.mtr"
// One step: given the question and what has been run so far, the analyst picks the next command,
// or answers. The app calls this once per step.
agent = {
  name = "Analyst"
  agent = @ref("analyst")
}
task = @prompt("next-command")
inputs.prompts = [
  {
    name = "question"
    required = true
  },
  {
    name = "transcript"
    description = "The commands run so far, each with its exit code and output"
    required = false
  }
]
schema.solution = @json("next-command")
```

**`maitento/json/next-command.json`**
```json title="maitento/json/next-command.json"
{
  "type": "object",
  "properties": {
    "done": {
      "type": "boolean",
      "description": "True when you can answer the question"
    },
    "command": {
      "type": "string",
      "description": "The next bash command to run, or an empty string when done"
    },
    "answer": {
      "type": "string",
      "description": "The answer, when done; otherwise an empty string"
    }
  },
  "required": ["done", "command", "answer"],
  "additionalProperties": false
}
```

**`maitento/prompts/next-command.md`**
```md title="maitento/prompts/next-command.md"
Answer this question about the files in /tmp/data: %%question%%

{{#if transcript}}
The commands you have run so far, each with its exit code and output:

%%transcript%%
{{/if}}

Give the next bash command to run. When you can answer the question, set done to true and give the answer instead.
```

**`data/sales.csv`**
```csv title="data/sales.csv"
date,region,product,units,unit_price
2026-09-01,North,Blue mug,12,8.50
2026-09-01,South,Desk lamp,3,59.90
2026-09-02,North,Tea sampler,20,12.00
2026-09-02,West,Blue mug,7,8.50
2026-09-03,South,Blue mug,15,8.50
2026-09-03,West,Desk lamp,5,59.90
2026-09-04,North,Desk lamp,2,59.90
2026-09-04,South,Tea sampler,9,12.00
2026-09-05,West,Tea sampler,14,12.00
2026-09-05,North,Blue mug,10,8.50
```

**`data/summarise.py`**
```python title="data/summarise.py"
# Runs inside the capsule. The VFS is mounted at /mnt/data, so files you put in it
# are right there, and anything written back to it is still there after the capsule ends.
import csv
from collections import defaultdict

totals = defaultdict(float)
units = defaultdict(int)
with open("/mnt/data/sales.csv", newline="") as f:
    for row in csv.DictReader(f):
        totals[row["product"]] += int(row["units"]) * float(row["unit_price"])
        units[row["product"]] += int(row["units"])

lines = ["# Sales report", "", "| Product | Units | Revenue |", "|---|---:|---:|"]
for product, revenue in sorted(totals.items(), key=lambda item: -item[1]):
    lines.append(f"| {product} | {units[product]} | {revenue:.2f} |")
lines += ["", f"Total revenue: {sum(totals.values()):.2f}"]

with open("/mnt/data/report.md", "w") as f:
    f.write("\n".join(lines) + "\n")
print("Wrote /mnt/data/report.md")
```
<!-- /tabs -->

</details>

<!-- /project -->

## If it didn't work

- **The deploy fails, saying `sales-data` can't be found:** the file system must exist before a capsule that mounts
  it is deployed. Run `sandbox.ts` first: it creates it.
- **The capsule ends `Error` with "Startup command failed: python3 /mnt/data/summarise.py - …":** the script exited
  with an error, or isn't in the file system. The message ends with what it printed to its error output.
- **The analyst's commands fail with `Permission denied` on `/mnt/data`:** a mounted file system belongs to the
  capsule's default user. Read the copy in `/tmp/data`, or run the command as the default user.
- **`commands.ts` fails with `CapsuleCommandAbortedError`:** the capsule ended before the command finished, for
  example because its start-up command failed or its `maxDuration` ran out. The message says why; the capsule's own
  `failureDetails` say more.
- **The answer is empty:** the agent didn't answer within the app's six steps. Ask a narrower question, or raise the
  step limit in `analyst.mtc`.
- **The app fails with "The capsule did not start":** the capsule's start-up failed, for example a package that
  doesn't exist in `packages`. The message says why.

## Review

**What you built:** a capsule that turns a CSV into a report with a Python script, a script that sends commands to a
capsule and reads their results, and an app that lets an agent run its own commands in a capsule until it can answer
a question, failures included.

**The concepts:**

- [A capsule](../concepts/capsules.md) is a throwaway Linux machine, with file systems mounted under `/mnt/` and
  packages installed as it starts.
- **Start-up commands** run as it starts; with `autoTerminate`, the capsule ends when they finish.
- **Commands** sent to a capsule that stays up come back with their exit code and output, for a script
  (`execAndWait`) or an agent to read. A failed command is a result, not an error.
- **An app runs the loop** when an agent works in a sandbox: the agent chooses, the app runs and reports back.
- **Users:** the default user is signed in to Maitento as you; give an agent's commands a user of their own.

**Challenge:** make the report show revenue by region too, and check it against the analyst's answer. Change only
the Python script. A solution in TypeScript, Python and C# is in
[`examples/21-sandboxes/solution`](../../examples/21-sandboxes/solution/):

```text
| Region | Revenue |
|---|---:|
| North | 546.80 |
| West | 527.00 |
| South | 415.20 |
```

**Next:** [22. Code pipelines](22-code-pipelines.md) puts AI coding agents to work on a git repository, in a sandbox
of their own.
