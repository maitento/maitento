---
title: 5. When things go wrong
description: Check an app's inputs, stop with your own message, catch an error and carry on, and read what a failed run reports.
sidebar:
  order: 105
---

# 5. When things go wrong

Add up an expense claim. Until now every input was good. Real ones aren't: an entry says `Hotel ninety`, the limit
says `lots`, or the claim is empty. For each thing that can go wrong, an app decides whether to **stop**, to **skip it
and carry on**, or to **finish early** because there's nothing to do. And when it stops, the run should say why, in
words the person who started it can act on.

> **You'll learn**
>
> - how to check the inputs before any work, and stop with your own message (`throw`)
> - how to end a run early from any function, when there's nothing to do (`exit`)
> - how to catch an error, find out what it was (`try`, `catch`, `GetLastError`), and carry on
> - how to swap a system call's error for one that says what to do
> - what a failed run reports: its status, its `failureDetails`, and what it did before it stopped
>
> **New concepts:** [errors](../../reference/cogniscript/index.md) (`throw`, `try` and `catch`, `exit`) ·
> [a failed run](../../concepts/apps.md#what-an-app-produces) (status `Error` and `failureDetails`)
>
> **Builds on:** [4. JSON in and out](4-json.md), and [3. Functions and files](3-functions.md) for the second file
>
> **Time:** ~15 min · **Cost:** nothing: the app uses only the standard library, no AI · **Needs:** nothing beyond
> Get started

## 1. The claim, and what can go wrong

The `expenses` app takes two inputs: `expenses`, as "what amount" pairs separated by semicolons, and `limit`, the
most the claim may come to. The scripts send these:

```text
expenses: Taxi 23.50; Lunch 12; Hotel ninety; Train 41.20
limit:    100
```

The app is two files: `expenses.mtc`, with `main`, and `checks.mtc`, with the functions that check and read the
values. Before writing any code, decide what each problem should do:

| What goes wrong | What the app does | The run ends |
|---|---|---|
| no expenses at all | stops, and says what to send | `Error` |
| the expenses are `none` | finishes: there's nothing to claim | `Finished` |
| the limit isn't a number | stops, and says what to send | `Error` |
| one entry can't be read, like `Hotel ninety` | skips it, notes it, and adds up the rest | `Finished` |
| no entry can be read | stops: there's nothing to add up | `Error` |
| the claim is over the limit | says so: that's a result, not a failure | `Finished` |

**Done when:** you can say why one unreadable entry finishes the run, but a claim with none readable fails it.

## 2. Check the inputs first

`main` checks its inputs before it does anything else:

<!-- snippet: examples/cogniscript-05-errors/maitento/apps/expenses/expenses.mtc#check -->
```c title="maitento/apps/expenses/expenses.mtc"
// Check the inputs before doing any work. CheckInputs and ReadLimit are in checks.mtc.
CheckInputs(expenses);
decimal max = ReadLimit(limit);
```
<!-- /snippet -->

`CheckInputs` is in `checks.mtc`:

<!-- snippet: examples/cogniscript-05-errors/maitento/apps/expenses/checks.mtc#check-inputs -->
```c title="maitento/apps/expenses/checks.mtc"
// Ends the run when there is nothing to do, and fails it when there is nothing it can use.
void CheckInputs(string expenses) {
	string trimmed = StringTrim(expenses);
	if (trimmed == "") {
		// throw ends the run with status Error. Its message becomes the run's failureDetails.
		throw("Send the expenses as \"what amount\" pairs separated by semicolons, such as \"Taxi 23.50; Lunch 12\".");
	}
	if (StringToLower(trimmed) == "none") {
		// Nothing to claim isn't an error. exit ends the whole run, from any function, with status Finished.
		exit("No expenses to claim.");
	}
}
```
<!-- /snippet -->

`CheckInputs` uses the two ways to end a run from anywhere:

- **`throw(message)`** ends the run with status `Error`, unless something catches it, and the message becomes the
  run's `failureDetails`. Use it when the app can't do its job.
- **`exit(value)`** ends the whole run with status `Finished`, and `value` becomes its return value. `return(value)`
  only leaves the function it's in; `exit` stops the run from any function, however deep. Use it when there's
  nothing left to do, and that's fine.

Both need brackets, and `exit` needs a value: `exit("")` if you have nothing to say.

Why check first? Without the check, an empty claim would run on, read nothing, and fail somewhere later with a
message about something else. A check at the top fails fast, with a message that says what to send. In an app that
calls AI, it also fails before anything has been spent.

**Done when:** you can say which call ends the run for `none`, and with what status.

## 3. Swap a system call's error for your own

`ReadLimit` turns the limit into a number:

<!-- snippet: examples/cogniscript-05-errors/maitento/apps/expenses/checks.mtc#read-limit -->
```c title="maitento/apps/expenses/checks.mtc"
// Reads the spending limit. StringToDecimal fails on text that isn't a number, with its own message: swap it for one
// that says what to send.
decimal ReadLimit(string limit) {
	try {
		return(StringToDecimal(limit));
	} catch {
		throw("The limit must be a number, such as 100, not \"" + limit + "\".");
	}
}
```
<!-- /snippet -->

- **`try { … } catch { … }`** runs the `try` block. When anything in it fails, a `throw` or a system call, the app
  skips the rest of the `try` and runs the `catch` block instead. The `catch` takes no variable.
- [`StringToDecimal`](../../reference/cogniscript/system-calls/conversion.md#stringtodecimal) fails on `lots` with
  `Cannot convert 'lots' to decimal`. That's true, but it doesn't tell the person what to do, so the `catch` throws a
  message that does.
- A `throw` inside a `catch` is caught by the next `try` out, if there is one. Here there isn't, so it ends the run.

**Done when:** you can say what the run's `failureDetails` will be for a limit of `lots`.

## 4. Catch a failure and carry on

The loop in `main` reads each entry, and one bad entry doesn't stop the rest:

<!-- snippet: examples/cogniscript-05-errors/maitento/apps/expenses/expenses.mtc#loop -->
```c title="maitento/apps/expenses/expenses.mtc"
// One bad entry shouldn't sink the whole claim: catch its error, note it, and carry on.
jsonArray entries = StringSplit(expenses, ";", true);
int count = JsonArrayCount(entries);
decimal total = 0;
jsonArray skipped = JsonArrayCreate();
for (int i = 0; i < count; i++) {
	string entry = StringTrim(JsonArrayGetAtIndex(entries, i));
	try {
		total = total + ReadAmount(entry);
		PrintLine("Added   " + entry);
	} catch {
		// GetLastError says what went wrong. It is set only inside the catch.
		PrintLine("Skipped " + entry + ": " + GetLastError());
		skipped = JsonArrayAdd(skipped, entry);
	}
}
```
<!-- /snippet -->

`ReadAmount`, in `checks.mtc`, reads the amount at the end of an entry:

<!-- snippet: examples/cogniscript-05-errors/maitento/apps/expenses/checks.mtc#read-amount -->
```c title="maitento/apps/expenses/checks.mtc"
// Reads the amount at the end of an entry such as "Taxi 23.50".
decimal ReadAmount(string entry) {
	int space = StringLastIndexOf(entry, " ", false);
	if (space < 0) {
		throw("there is no amount");
	}
	// Nothing here catches StringToDecimal's error, so it goes up to the catch in main.
	return(StringToDecimal(StringSubstring(entry, space + 1, "")));
}
```
<!-- /snippet -->

- **An error travels up** through the functions that called it, until it reaches a `catch`. `ReadAmount` doesn't
  catch anything, so both its own `throw("there is no amount")` and `StringToDecimal`'s error land in the `catch` in
  `main`, and the loop goes on to the next entry.
- **[`GetLastError()`](../../reference/cogniscript/system-calls/miscellaneous.md#getlasterror) says what went
  wrong:** the message of a `throw`, or a system call's reason, such as `Cannot convert 'ninety' to decimal`. It's
  set only inside the `catch` block, and empty again once the block ends, so read it there.
- The `catch` doesn't hide the problem: it prints it, and adds the entry to `skipped`, which the app publishes.
  Catching an error and saying nothing is how a run "succeeds" with the wrong answer.

**Done when:** you can say which two entries of `Hotel ninety; Parking` would be skipped, and with which messages.

## 5. Decide what's worth stopping for

<!-- snippet: examples/cogniscript-05-errors/maitento/apps/expenses/expenses.mtc#end -->
```c title="maitento/apps/expenses/expenses.mtc"
// Some failures are worth stopping for: a claim with nothing readable in it is one.
if (JsonArrayCount(skipped) == count) {
	throw("None of the " + count + " expenses could be read.");
}

AppStateSetOutputDecimal("total", total);
AppStateSetOutputJsonArray("skipped", skipped);
string summary = DecimalToString(total, "0.00") + " of " + DecimalToString(max, "0.00");
if (total > max) {
	return("Over the limit: " + summary);
}
return("Within the limit: " + summary);
```
<!-- /snippet -->

A claim where every entry was skipped has nothing in it, so that `throw`s. A claim over the limit is a perfectly
good answer, so that returns. Whether something is an error is your call, and the status is how you tell the code
that runs the app: `Finished` means "here's your answer", and `Error` means "I couldn't do it, and `failureDetails`
says why".

**Done when:** the project validates. Run `mt build ./maitento`, or press **Validate** in the portal's
**Build studio**.

## 6. Run it, and read what the run reports

The scripts pass `throwOnFailure: false` (`throw_on_failure=False` in Python, `ThrowOnFailure = false` in C#), so a
failed run comes back instead of raising an error. They print the status, then the result or the reason. Run them
from the language's folder in [`examples/cogniscript-05-errors`](../../../examples/cogniscript-05-errors/), as in
the [track's overview](index.md):

<!-- tabs -->
<!-- snippet: examples/cogniscript-05-errors/typescript/expenses.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// The app's two inputs: the expenses, as "what amount" pairs separated by semicolons, and the spending limit.
const expenses = process.argv[2] ?? "Taxi 23.50; Lunch 12; Hotel ninety; Train 41.20";
const limit = process.argv[3] ?? "100";

// throwOnFailure: false hands back a failed run instead of throwing, so you can read what it reports.
const run = await mt.apps.run("expenses", { inputs: { expenses, limit } }, { throwOnFailure: false });

for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nStatus: ${run.status}`);
if (run.status === "Finished") {
  console.log(`Returned: ${run.returnValue}`);
  for (const output of run.outputs) console.log(`Output "${output.name}": ${output.value}`);
} else {
  console.log(`Failure: ${run.failureDetails}`);
}
```
<!-- /snippet -->
<!-- snippet: examples/cogniscript-05-errors/python/expenses.py -->
```python title="Python"
import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# The app's two inputs: the expenses, as "what amount" pairs separated by semicolons, and the spending limit.
expenses = sys.argv[1] if len(sys.argv) > 1 else "Taxi 23.50; Lunch 12; Hotel ninety; Train 41.20"
limit = sys.argv[2] if len(sys.argv) > 2 else "100"

# throw_on_failure=False hands back a failed run instead of raising, so you can read what it reports.
run = mt.apps.run("expenses", inputs={"expenses": expenses, "limit": limit}, throw_on_failure=False)

for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nStatus: {run.status}")
if run.status == "Finished":
    print(f"Returned: {run.return_value}")
    for output in run.outputs:
        print(f'Output "{output.name}": {output.value}')
else:
    print(f"Failure: {run.failure_details}")
```
<!-- /snippet -->
<!-- snippet: examples/cogniscript-05-errors/csharp/expenses.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Apps;
using Maitento.Sdk;
using Maitento.Sdk.Runs;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// The app's two inputs: the expenses, as "what amount" pairs separated by semicolons, and the spending limit.
var expenses = args.Length > 0 ? args[0] : "Taxi 23.50; Lunch 12; Hotel ninety; Train 41.20";
var limit = args.Length > 1 ? args[1] : "100";

// ThrowOnFailure = false hands back a failed run instead of throwing, so you can read what it reports.
var inputs = new Dictionary<string, string> { ["expenses"] = expenses, ["limit"] = limit };
var run = await mt.Apps.RunAsync("expenses", inputs, new RunOptions<AppProcess> { ThrowOnFailure = false });

foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nStatus: {run.Status}");
if (run.Status == AppProcessStatus.Finished)
{
    Console.WriteLine($"Returned: {run.ReturnValue}");
    foreach (var output in run.Outputs) Console.WriteLine($"Output \"{output.Name}\": {output.Value}");
}
else
{
    Console.WriteLine($"Failure: {run.FailureDetails}");
}
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt app-run expenses --input-expenses "Taxi 23.50; Lunch 12; Hotel ninety; Train 41.20" --input-limit "100"
```
<!-- /tabs -->

```text
Added   Taxi 23.50
Added   Lunch 12
Skipped Hotel ninety: Cannot convert 'ninety' to decimal
Added   Train 41.20

Status: Finished
Returned: Within the limit: 76.70 of 100.00
Output "total": 76.70
Output "skipped": ["Hotel ninety"]
```

One entry was skipped, said so, and the run finished with the rest. Now try the other cases from step 1, passing the
expenses and the limit as arguments, such as `node expenses.ts none`:

| Arguments | What the scripts print |
|---|---|
| `none` | `Status: Finished`<br>`Returned: No expenses to claim.` |
| `""` | `Status: Error`<br>`Failure: Send the expenses as "what amount" pairs separated by semicolons, such as "Taxi 23.50; Lunch 12".` |
| `"Taxi 23.50" lots` | `Status: Error`<br>`Failure: The limit must be a number, such as 100, not "lots".` |
| `"Hotel ninety; Parking"` | the two `Skipped` lines, then `Status: Error`<br>`Failure: None of the 2 expenses could be read.` |
| `"Taxi 23.50; Lunch 12; Hotel ninety; Train 41.20" 50` | the four lines above, then `Status: Finished`<br>`Returned: Over the limit: 76.70 of 50.00` |

A run that ends `Error` reports:

- **`status`**: `Error`;
- **`failureDetails`**: the message of the `throw` that ended it, or for an error nobody caught, the system call that
  failed and why (you'll see one next);
- **`consoleOutputs`**: everything it printed before it stopped;
- **`outputs`**: any named outputs it had set before it stopped, which it keeps;
- no **`returnValue`**.

The portal's **Runs** shows the same run, with its **Console** up to the moment it stopped.

**Done when:** you've seen `Status: Finished` for `none` and `Status: Error` for an empty claim.

## All the files

<!-- project: examples/cogniscript-05-errors -->
**On GitHub:** [`examples/cogniscript-05-errors`](https://github.com/maitento/maitento/tree/main/examples/cogniscript-05-errors) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/cogniscript-05-errors/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/cogniscript-05-errors/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/cogniscript-05-errors/csharp)

<details>
<summary>All the files in this project (3)</summary>

<!-- tabs: files -->
**`maitento/apps/expenses/checks.mtc`**
```c title="maitento/apps/expenses/checks.mtc"
// region:check-inputs
// Ends the run when there is nothing to do, and fails it when there is nothing it can use.
void CheckInputs(string expenses) {
	string trimmed = StringTrim(expenses);
	if (trimmed == "") {
		// throw ends the run with status Error. Its message becomes the run's failureDetails.
		throw("Send the expenses as \"what amount\" pairs separated by semicolons, such as \"Taxi 23.50; Lunch 12\".");
	}
	if (StringToLower(trimmed) == "none") {
		// Nothing to claim isn't an error. exit ends the whole run, from any function, with status Finished.
		exit("No expenses to claim.");
	}
}
// endregion

// region:read-limit
// Reads the spending limit. StringToDecimal fails on text that isn't a number, with its own message: swap it for one
// that says what to send.
decimal ReadLimit(string limit) {
	try {
		return(StringToDecimal(limit));
	} catch {
		throw("The limit must be a number, such as 100, not \"" + limit + "\".");
	}
}
// endregion

// region:read-amount
// Reads the amount at the end of an entry such as "Taxi 23.50".
decimal ReadAmount(string entry) {
	int space = StringLastIndexOf(entry, " ", false);
	if (space < 0) {
		throw("there is no amount");
	}
	// Nothing here catches StringToDecimal's error, so it goes up to the catch in main.
	return(StringToDecimal(StringSubstring(entry, space + 1, "")));
}
// endregion
```

**`maitento/apps/expenses/expenses.mtc`**
```c title="maitento/apps/expenses/expenses.mtc"
// The expenses app: it checks its inputs, adds up every expense it can read, and reports the ones it can't.
string main(string expenses, string limit) {
	// region:check
	// Check the inputs before doing any work. CheckInputs and ReadLimit are in checks.mtc.
	CheckInputs(expenses);
	decimal max = ReadLimit(limit);
	// endregion

	// region:loop
	// One bad entry shouldn't sink the whole claim: catch its error, note it, and carry on.
	jsonArray entries = StringSplit(expenses, ";", true);
	int count = JsonArrayCount(entries);
	decimal total = 0;
	jsonArray skipped = JsonArrayCreate();
	for (int i = 0; i < count; i++) {
		string entry = StringTrim(JsonArrayGetAtIndex(entries, i));
		try {
			total = total + ReadAmount(entry);
			PrintLine("Added   " + entry);
		} catch {
			// GetLastError says what went wrong. It is set only inside the catch.
			PrintLine("Skipped " + entry + ": " + GetLastError());
			skipped = JsonArrayAdd(skipped, entry);
		}
	}
	// endregion

	// region:end
	// Some failures are worth stopping for: a claim with nothing readable in it is one.
	if (JsonArrayCount(skipped) == count) {
		throw("None of the " + count + " expenses could be read.");
	}

	AppStateSetOutputDecimal("total", total);
	AppStateSetOutputJsonArray("skipped", skipped);
	string summary = DecimalToString(total, "0.00") + " of " + DecimalToString(max, "0.00");
	if (total > max) {
		return("Over the limit: " + summary);
	}
	return("Within the limit: " + summary);
	// endregion
}
```

**`maitento/apps/expenses/expenses.mtr`**
```hcl title="maitento/apps/expenses/expenses.mtr"
// Optional settings for the app. Stop it if it runs for more than a minute.
duration.max = "00:01:00"
```
<!-- /tabs -->

</details>

<!-- /project -->

## Break it on purpose

Take the `try` and `catch` out of the loop. In `expenses.mtc`, make the loop's body just these lines:

```c
		string entry = StringTrim(JsonArrayGetAtIndex(entries, i));
		total = total + ReadAmount(entry);
		PrintLine("Added   " + entry);
```

Deploy and run the claim again:

```text
Added   Taxi 23.50
Added   Lunch 12

Status: Error
Failure: StringToDecimal failed: Cannot convert 'ninety' to decimal
```

Nothing caught `StringToDecimal`'s error, so it ended the run at `Hotel ninety`, and `Train 41.20` was never read.
An error nobody catches names the system call that failed, then says why: here, the call in `ReadAmount`. The
console shows how far the run got. Put the `try` and `catch` back.

## If it didn't work

- **The run fails with `No error value to set variable ':ex' from`.** A `try` with its own `catch` ran inside a
  `catch` block, perhaps in a function the `catch` called. Once an inner `catch` has run, the outer one can't finish.
  Inside a `catch`, note what you need, and do anything that might fail again after the block.
- **`GetLastError()` gives empty text.** It was read after the `catch` block ended. Read it inside the block, or save
  it in a variable there.
- **The deploy fails with `Exit requires a parameter`.** `exit` needs a value: `exit("")`.
- **The deploy fails with `Argument count mismatch for StringSplit`.** Every argument is required, even `removeEmpty`:
  `StringSplit(expenses, ";", true)`.
- **The script stops with `ProcessFailedError` (or `MaitentoProcessFailedException`) instead of printing
  `Status: Error`.** The `throwOnFailure: false` option is missing from the run call.

## Review

You built:

- an app that checks its inputs, adds up the entries it can read and skips the ones it can't;
- a script that prints what a run reports, whether it finished or failed;
- error messages that say what to do, in place of a system call's own.

The concepts:

- [Errors](../../reference/cogniscript/index.md): `throw(message)` ends the run with `Error` unless something catches
  it. `try { } catch { }` catches any error in the `try` block, from a `throw` or a system call, however deep, and
  `GetLastError()` says what it was, inside the `catch`. `exit(value)` ends the run with `Finished`, from any
  function.
- [A failed run](../../concepts/apps.md#what-an-app-produces): status `Error`, with `failureDetails` holding the
  `throw`'s message or the system call that failed and why. It keeps its console and the outputs set before it
  stopped.
- Deciding: check inputs up front and fail fast; skip and report what one bad item spoils; finish early when there's
  nothing to do.

**Challenge:** a refund such as `Refund -10` is read as -10, and quietly lowers the total. Make `ReadAmount` refuse an
amount below zero with its own error, so the entry is skipped as `Refund -10: amounts can't be negative`. The solution
is in [`examples/cogniscript-05-errors/solution`](../../../examples/cogniscript-05-errors/solution/): a copy of the
app, `expenses-strict`, with the check.

**Next:** [6. Orchestration patterns](6-orchestration.md) puts these to work in apps that run interactions: retrying a
run that failed, keeping the first answer, running another app, and running many at a time.
