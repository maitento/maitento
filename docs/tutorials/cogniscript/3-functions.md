---
title: 3. Functions and files
description: Write your own functions, with parameters and return types, use void, and split an app over several .mtc files.
sidebar:
  order: 103
---

# 3. Functions and files

Split lesson 2's shipping app into functions, over two files, without changing what it does. The app works, but its
`main` does everything, and the rules that matter (what each destination costs, which box a parcel needs) are buried
in the middle of a loop. A **function** gives a piece of work a name, takes what it needs as parameters, and hands
back its answer. Then `main` reads like a description of the job, and each rule lives in one place.

> **You'll learn**
>
> - how to write a function: the type it returns, its name and its parameters
> - how `return` hands back a value and leaves the function, and what `void` means
> - what a function can see: its own parameters and variables, which are copies, and nothing of its caller's
> - how an app's code is split over several `.mtc` files, and what the files share
>
> **New concepts:** [functions](../../reference/cogniscript/index.md#functions) · `void` · an app's files
>
> **Builds on:** [2. Decisions and loops](2-decisions-and-loops.md) (this is the same app)
>
> **Time:** ~15 min · **Cost:** nothing: the app uses only the standard library, no AI · **Needs:** nothing beyond
> Get started

## 1. Move the rates into functions

The app's folder now holds two code files, `shipping.mtc` and `rates.mtc`, and the same settings file. The rates go
in `rates.mtc`, one function each:

<!-- snippet: examples/cogniscript-03-functions/maitento/apps/shipping/rates.mtc -->
```c title="maitento/apps/shipping/rates.mtc"
// The shipping app's rates. return hands a value back and leaves the function at once, so no else is needed
// after a branch that returns.

// How many times the UK price a destination costs.
decimal DestinationRate(string destination) {
	if (destination == "UK") {
		return(1);
	}
	if (destination == "EU" || destination == "Europe") {
		return(1.5);
	}
	return(3);
}

// The size of box that a parcel of kg kilograms needs.
string BoxSize(decimal kg) {
	if (kg <= 2) {
		return("small");
	}
	if (kg <= 10) {
		return("medium");
	}
	return("large");
}

// What a box of that size costs to send in the UK.
decimal SizePrice(string size) {
	if (size == "small") {
		return(3.5);
	}
	if (size == "medium") {
		return(6);
	}
	return(11);
}

// The total after the discount: UK orders of 40 or more get 10% off.
decimal WithDiscount(decimal total, string destination) {
	if (destination == "UK" && total >= 40) {
		PrintLine("10% off UK orders of 40 or more");
		return(total * 0.9);
	}
	return(total);
}
```
<!-- /snippet -->

A function starts like `main` does, because `main` is a function too:

```c
decimal DestinationRate(string destination) {
```

That's the type of value it returns (`decimal`), its name, and its parameters, each with a type. A call passes a value
for every parameter, in order: `DestinationRate("EU")` runs the function with `destination` set to `"EU"`, and is
replaced by what it returns, `1.5`.

**`return` hands a value back and leaves the function at once.** So once a branch has returned, the lines after it
don't run for that call, and there's no need for `else`: in `BoxSize`, a 12.5 kg box isn't at most 2 kg or at most
10 kg, so it reaches the last line and gets `"large"`. A function that returns a value must reach a `return` on every
path.

As with variables, the types of parameters and return values say what you mean, and nothing checks them (every value
is still text). Choose them so that the first line of a function tells a reader what it takes and what it gives.

**Done when:** you can say what `BoxSize(12.5)` gives (`"large"`), and what `SizePrice` gives for that (`11`).

## 2. Functions that print

`shipping.mtc` keeps `main`, and two small functions of its own:

<!-- snippet: examples/cogniscript-03-functions/maitento/apps/shipping/shipping.mtc#helpers -->
```c title="maitento/apps/shipping/shipping.mtc"
// A function names the type it returns, then its parameters. void means it returns nothing.
// It sees only its own parameters and variables: everything it needs is passed in.
void PrintBox(int number, decimal kg, string size, decimal price) {
	string amount = Money(price);
	PrintLine("Box " + number + ": " + kg + " kg, " + size + ", " + amount);
}

// An amount of money as text, with two decimal places.
string Money(decimal amount) {
	return(DecimalToString(amount, "0.00"));
}
```
<!-- /snippet -->

- **`void`** means a function returns nothing. `PrintBox` prints a line and is done, so it's called on its own, as a
  statement: `PrintBox(boxes, box, size, price);`.
- `Money` turns an amount into text with two decimal places. The app writes money in two places, and with one
  function for it, they can't come out differently.

**A function sees only its own parameters and variables.** It can't read `main`'s, which is why `PrintBox` is handed
the box's number rather than looking at `boxes`. And it gets **copies**: if `PrintBox` changed `kg`, `main`'s `box`
would stay as it was. A function that works something out hands it back with `return`, and the caller keeps it, as
`main` does with the discount: `total = WithDiscount(total, destination);`.

**Done when:** you can say why `PrintBox` has a `number` parameter: it can't see `main`'s `boxes`.

## 3. main, shorter

`main` is the loop from lesson 2, with the rules taken out:

<!-- snippet: examples/cogniscript-03-functions/maitento/apps/shipping/shipping.mtc#main -->
```c title="maitento/apps/shipping/shipping.mtc"
string main(string weights, string destination) {
	decimal rate = DestinationRate(destination);
	PrintLine("Shipping to " + destination);

	jsonArray parcels = StringSplit(weights, ",", false);
	int boxes = 0;
	decimal total = 0;
	for (int i = 0; i < JsonArrayCount(parcels); i++) {
		if (boxes == 6) {
			PrintLine("The van is full: the other parcels wait for the next one.");
			break;
		}

		string weight = StringTrim(JsonArrayGetAtIndex(parcels, i));
		if (weight == "") {
			continue;
		}
		if (!TypeIsDecimal(weight)) {
			PrintLine("Skipped \"" + weight + "\": not a weight in kg");
			continue;
		}

		decimal left = weight;
		while (left > 0) {
			decimal box = MathMin(left, 20);
			left = left - box;
			// Each call hands back its answer: keep it in a variable, and pass it on.
			string size = BoxSize(box);
			decimal price = SizePrice(size) * rate;
			boxes = boxes + 1;
			total = total + price;
			PrintBox(boxes, box, size, price);
		}
	}

	total = WithDiscount(total, destination);
	string shown = Money(total);
	PrintLine("Total for " + boxes + " boxes: " + shown);
	return(shown);
}
```
<!-- /snippet -->

Each answer goes into a variable and is passed on: `BoxSize` works out the box's `size` once, and `SizePrice` and
`PrintBox` both get it. Calls to your own functions look like calls to system calls such as `MathMin`, and work the
same way: they take every argument.

**Every `.mtc` file in the app's folder is part of the app.** A deploy compiles them together, so `main` calls
functions in `rates.mtc`, and calls `PrintBox`, which comes after it in the same file: the order of files and of
functions doesn't matter. What the files share is their functions, nothing else. Two rules follow:

- **A function's name is used once in the whole app,** across all its files.
- **An app's files are its own.** Another app can't call these functions, even in the same project. To use them
  there, copy the file into that app's folder (the challenge does).

Split the files by subject, as here: the rules in one, the job and its printing in the other. Someone changing the
prices opens `rates.mtc` and needn't read the loop.

**Done when:** the project validates. Run `mt build ./maitento`, or press **Validate** in the portal's **Build
studio**.

## 4. Run it

The scripts are lesson 2's: the app has the same name and the same inputs.

<!-- tabs -->
<!-- snippet: examples/cogniscript-03-functions/typescript/shipping.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// Run the shipping app. Its main(string weights, string destination) parameters are its inputs.
const [weights = "0.4, 3, kg, 12.5, , 45, 7", destination = "UK"] = process.argv.slice(2);
const run = await mt.apps.run("shipping", { inputs: { weights, destination } });

// What the app printed, what it returned, and every named output, in the order the app first set them.
for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nReturned: ${run.returnValue}`);
for (const output of run.outputs) console.log(`Output "${output.name}": ${output.value}`);
```
<!-- /snippet -->
<!-- snippet: examples/cogniscript-03-functions/python/shipping.py -->
```python title="Python"
import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# Run the shipping app. Its main(string weights, string destination) parameters are its inputs.
args = sys.argv[1:]
weights = args[0] if len(args) > 0 else "0.4, 3, kg, 12.5, , 45, 7"
destination = args[1] if len(args) > 1 else "UK"
run = mt.apps.run("shipping", inputs={"weights": weights, "destination": destination})

# What the app printed, what it returned, and every named output, in the order the app first set them.
for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nReturned: {run.return_value}")
for output in run.outputs:
    print(f'Output "{output.name}": {output.value}')
```
<!-- /snippet -->
<!-- snippet: examples/cogniscript-03-functions/csharp/shipping.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// Run the shipping app. Its main(string weights, string destination) parameters are its inputs.
var weights = args.Length > 0 ? args[0] : "0.4, 3, kg, 12.5, , 45, 7";
var destination = args.Length > 1 ? args[1] : "UK";
var run = await mt.Apps.RunAsync("shipping", new Dictionary<string, string> { ["weights"] = weights, ["destination"] = destination });

// What the app printed, what it returned, and every named output, in the order the app first set them.
foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nReturned: {run.ReturnValue}");
foreach (var output in run.Outputs) Console.WriteLine($"Output \"{output.Name}\": {output.Value}");
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt app-run shipping --input-weights "0.4, 3, kg, 12.5, , 45, 7" --input-destination "UK"
```
<!-- /tabs -->

Run it from the language's folder in
[`examples/cogniscript-03-functions`](../../../examples/cogniscript-03-functions/). Deploying it replaces lesson 2's
`shipping` app in your namespace with this one.

```text
Shipping to UK
Box 1: 0.4 kg, small, 3.50
Box 2: 3 kg, medium, 6.00
Skipped "kg": not a weight in kg
Box 3: 12.5 kg, large, 11.00
Box 4: 20 kg, large, 11.00
Box 5: 20 kg, large, 11.00
Box 6: 5 kg, medium, 6.00
The van is full: the other parcels wait for the next one.
10% off UK orders of 40 or more
Total for 6 boxes: 43.65

Returned: 43.65
```

Line for line, lesson 2's output. That's the test of a change like this one: the code is easier to read and change,
and it does exactly what it did. Try `EU`, `World` and `uk` too: the answers are lesson 2's.

**Done when:** you see the same six boxes and `Returned: 43.65`.

## All the files

<!-- project: examples/cogniscript-03-functions -->
**On GitHub:** [`examples/cogniscript-03-functions`](https://github.com/maitento/maitento/tree/main/examples/cogniscript-03-functions) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/cogniscript-03-functions/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/cogniscript-03-functions/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/cogniscript-03-functions/csharp)

<details>
<summary>All the files in this project (3)</summary>

<!-- tabs: files -->
**`maitento/apps/shipping/rates.mtc`**
```c title="maitento/apps/shipping/rates.mtc"
// The shipping app's rates. return hands a value back and leaves the function at once, so no else is needed
// after a branch that returns.

// How many times the UK price a destination costs.
decimal DestinationRate(string destination) {
	if (destination == "UK") {
		return(1);
	}
	if (destination == "EU" || destination == "Europe") {
		return(1.5);
	}
	return(3);
}

// The size of box that a parcel of kg kilograms needs.
string BoxSize(decimal kg) {
	if (kg <= 2) {
		return("small");
	}
	if (kg <= 10) {
		return("medium");
	}
	return("large");
}

// What a box of that size costs to send in the UK.
decimal SizePrice(string size) {
	if (size == "small") {
		return(3.5);
	}
	if (size == "medium") {
		return(6);
	}
	return(11);
}

// The total after the discount: UK orders of 40 or more get 10% off.
decimal WithDiscount(decimal total, string destination) {
	if (destination == "UK" && total >= 40) {
		PrintLine("10% off UK orders of 40 or more");
		return(total * 0.9);
	}
	return(total);
}
```

**`maitento/apps/shipping/shipping.mtc`**
```c title="maitento/apps/shipping/shipping.mtc"
// The shipping app from lesson 2, split into functions: main and the printing are here, the rates in rates.mtc.
// Every .mtc file in the app's folder is part of the app, so a function in one file can call one in another.
// region:main
string main(string weights, string destination) {
	decimal rate = DestinationRate(destination);
	PrintLine("Shipping to " + destination);

	jsonArray parcels = StringSplit(weights, ",", false);
	int boxes = 0;
	decimal total = 0;
	for (int i = 0; i < JsonArrayCount(parcels); i++) {
		if (boxes == 6) {
			PrintLine("The van is full: the other parcels wait for the next one.");
			break;
		}

		string weight = StringTrim(JsonArrayGetAtIndex(parcels, i));
		if (weight == "") {
			continue;
		}
		if (!TypeIsDecimal(weight)) {
			PrintLine("Skipped \"" + weight + "\": not a weight in kg");
			continue;
		}

		decimal left = weight;
		while (left > 0) {
			decimal box = MathMin(left, 20);
			left = left - box;
			// Each call hands back its answer: keep it in a variable, and pass it on.
			string size = BoxSize(box);
			decimal price = SizePrice(size) * rate;
			boxes = boxes + 1;
			total = total + price;
			PrintBox(boxes, box, size, price);
		}
	}

	total = WithDiscount(total, destination);
	string shown = Money(total);
	PrintLine("Total for " + boxes + " boxes: " + shown);
	return(shown);
}
// endregion

// region:helpers
// A function names the type it returns, then its parameters. void means it returns nothing.
// It sees only its own parameters and variables: everything it needs is passed in.
void PrintBox(int number, decimal kg, string size, decimal price) {
	string amount = Money(price);
	PrintLine("Box " + number + ": " + kg + " kg, " + size + ", " + amount);
}

// An amount of money as text, with two decimal places.
string Money(decimal amount) {
	return(DecimalToString(amount, "0.00"));
}
// endregion
```

**`maitento/apps/shipping/shipping.mtr`**
```hcl title="maitento/apps/shipping/shipping.mtr"
// Stop the app if it runs for more than a minute: a loop whose condition never turns false would run until then.
duration.max = "00:01:00"
```
<!-- /tabs -->

</details>

<!-- /project -->

## Break it on purpose

Let `PrintBox` use `main`'s counter instead of being given it. In `shipping.mtc`, call it without the number:

```c
			PrintBox(box, size, price);
```

and change the function to match:

```c
void PrintBox(decimal kg, string size, decimal price) {
	string amount = Money(price);
	PrintLine("Box " + boxes + ": " + kg + " kg, " + size + ", " + amount);
```

Deploy and run it. The deploy succeeds, and the run fails:

```text
ProcessFailedError: App run 8d1c5e2a-4b7f-4f0e-9a3d-2c6b1e9f7a40 ended Error: Variable boxes does not exist
```

`boxes` belongs to `main`, and `PrintBox` can't see it. The deploy didn't notice, because a name is looked up when the
line runs, not before. The run's **Console** in the portal shows how far it got: `Shipping to UK`, and nothing
after it, because the run stopped at the first box. Pass the number in again, and it works.

## If it didn't work

- **The deploy fails with "Unknown call to Mony (shipping.mtc:40)".** No function has that name: check the spelling,
  and that the function is in a file in this app's folder.
- **The deploy fails with "Argument count mismatch for PrintBox (shipping.mtc:35)".** A call passes a value for every
  parameter, in order, as for a system call.
- **The deploy fails with "Function Money is already defined".** Two functions in the app have the same name. They
  may be in different files: the error names the second one it found.
- **The run fails with "Variable boxes does not exist".** A function used a variable of its caller's. Pass it in as a
  parameter.
- **The run fails with "No return value to set variable …".** A function that should return a value reached its end
  without a `return`, and its caller used the value. Check every path through it ends in `return(...)`.

## Review

You built:

- the shipping app again, as functions over two files, with exactly the output it had before.

The concepts:

- A function: `type Name(type parameter, …) { … }`, called as `Name(value, …)`. `main` is a function too.
- `return(...)` hands back a value and leaves the function at once. `void` means a function returns nothing, so it's
  called as a statement.
- A function sees only its parameters and its own variables. Parameters are copies: to change something, return the
  new value and let the caller keep it.
- Every `.mtc` file in an app's folder is part of that app, in any order. A function name is used once per app, and
  one app can't call another's functions. The full syntax is in the
  [Cogniscript language reference](../../reference/cogniscript/index.md).

**Challenge:** write a second app, `compare`, that quotes the same parcels for several destinations and returns the
cheapest. Give it two inputs, `weights` and `destinations` (`UK, EU, World`), move the packing loop into a function
`decimal Quote(string weights, string destination)` that returns the total without printing the boxes, and print one
line per destination. It needs the rates, so copy `rates.mtc` into its folder. The solution is in
[`examples/cogniscript-03-functions/solution`](../../../examples/cogniscript-03-functions/solution/), and returns
`UK`.

**Next:** [4. JSON in and out](4-json.md) sends an app structured input as JSON, and hands back typed named outputs.
