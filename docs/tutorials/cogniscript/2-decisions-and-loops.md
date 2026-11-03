---
title: 2. Decisions and loops
description: Compare values, combine conditions, choose with if and else, and repeat with for and while, break and continue.
sidebar:
  order: 102
---

# 2. Decisions and loops

Quote delivery for a list of parcels: pick a rate for the destination, pack each parcel into boxes of up to 20 kg,
skip anything that isn't a weight, stop when the van is full, and take 10% off big UK orders. The receipt in
[lesson 1](1-values.md) ran every line once, top to bottom. Real work needs more: **decisions** choose which lines
run, and **loops** run lines again, once for each thing to handle.

> **You'll learn**
>
> - how to compare values, and why `==` compares the text exactly
> - how to combine conditions with `&&`, `||` and `!`
> - how `if`, `else if` and `else` choose what runs
> - how `for` and `while` repeat lines, and how `break` and `continue` change what happens next
> - why a loop needs a way out, and how an app's time limit catches one that has none
>
> **New concepts:** [comparisons and conditions](../../reference/cogniscript/index.md#comparisons) ·
> [if, for and while](../../reference/cogniscript/index.md#statements) · an app's time limit (`duration.max`)
>
> **Builds on:** [1. Values and text](1-values.md)
>
> **Time:** ~20 min · **Cost:** nothing: the app uses only the standard library, no AI · **Needs:** nothing beyond
> Get started

## 1. Pick a rate

The app, `apps/shipping/`, takes two inputs: `weights`, a list of parcel weights in kg separated by commas, and
`destination`. Its first job is to choose a rate for the destination:

<!-- snippet: examples/cogniscript-02-loops/maitento/apps/shipping/shipping.mtc#rate -->
```c title="maitento/apps/shipping/shipping.mtc"
// if / else if / else: the first condition that is true picks the rate; else catches the rest.
decimal rate = 0;
if (destination == "UK") {
	rate = 1;
} else if (destination == "EU" || destination == "Europe") {
	rate = 1.5;
} else {
	rate = 3;
}
PrintLine("Shipping to " + destination);
```
<!-- /snippet -->

`if` runs its block when its condition is true. `else if` is tried only when everything before it was false, and
`else` catches whatever is left. So exactly one of the three rates is set.

A condition is a comparison, or several joined together:

| Operator | Means | Compares |
|---|---|---|
| `==`, `!=` | equal, not equal | the **text**, exactly |
| `<`, `<=`, `>`, `>=` | less than, at most, more than, at least | as **numbers** |
| `&&` | both sides are true | |
| `\|\|` | at least one side is true | |
| `!` | not: turns true into false, and false into true | |

Because every value is text, `==` compares text, and it's exact: capitals count, and so does how a number is written.
The others compare numbers:

| You write | You get |
|---|---|
| `"uk" == "UK"` | `False` |
| `12 == 12.0` | `False`: the text differs |
| `12 >= 12.0` | `True`: as numbers, they're the same |
| `"10" > "9"` | `True`: compared as numbers, not as text |
| `!(25 > 20)` | `False` |

A comparison gives a `bool`, and a `bool` prints as `True` or `False`. You can keep one in a variable,
`bool heavy = box > 10;`, and use it as a condition: `if (heavy) { … }`.

**Done when:** you can say which rate `Europe` gets (1.5, through `||`) and which `France` gets (3, from `else`).

## 2. Go through the parcels

`weights` is one piece of text, such as `0.4, 3, kg, 12.5, , 45, 7`. The app cuts it up and handles each part in turn:

<!-- snippet: examples/cogniscript-02-loops/maitento/apps/shipping/shipping.mtc#parcels -->
```c title="maitento/apps/shipping/shipping.mtc"
// StringSplit cuts the text at each comma into a list. Lesson 4 covers lists; here you need only
// how many items it has (JsonArrayCount) and the item at a position (JsonArrayGetAtIndex).
jsonArray parcels = StringSplit(weights, ",", false);
int boxes = 0;
decimal total = 0;
for (int i = 0; i < JsonArrayCount(parcels); i++) {
	// The van takes six boxes. break leaves the loop at once: the other parcels wait.
	if (boxes == 6) {
		PrintLine("The van is full: the other parcels wait for the next one.");
		break;
	}

	string weight = StringTrim(JsonArrayGetAtIndex(parcels, i));
	// continue skips the rest of this turn of the loop, and goes on to the next parcel.
	if (weight == "") {
		continue;
	}
	// ! turns true into false: "if the weight is not a number".
	if (!TypeIsDecimal(weight)) {
		PrintLine("Skipped \"" + weight + "\": not a weight in kg");
		continue;
	}
```
<!-- /snippet -->

- [`StringSplit(text, separator, removeEmpty)`](../../reference/cogniscript/system-calls/strings.md#stringsplit) cuts
  the text at each comma into a list. `false` keeps empty parts, so the app sees the slip in `12.5, , 45` and can skip
  it. Lists are [lesson 4](4-json.md)'s subject; for now you need two calls:
  [`JsonArrayCount`](../../reference/cogniscript/system-calls/json.md#jsonarraycount) for how many items there are, and
  [`JsonArrayGetAtIndex`](../../reference/cogniscript/system-calls/json.md#jsonarraygetatindex) for the item at a
  position, counting from 0.
- **`for (start; condition; step)`** runs its block again and again: `int i = 0` happens once, the block runs while
  `i < JsonArrayCount(parcels)` is true, and `i++` adds one to `i` after each turn. So `i` is 0, 1, 2 and so on, one
  for each part. `i` exists only inside the loop.
- **`continue`** skips the rest of this turn, and goes straight on to the next part. The app uses it twice: for an
  empty part, silently, and for one that isn't a number, with a message.
- **`break`** leaves the loop altogether. The van takes six boxes, so once there are six, the app says so and stops
  packing. The parcels after that are never looked at.
- [`StringTrim`](../../reference/cogniscript/system-calls/strings.md#stringtrim) takes the spaces off each part, and
  [`TypeIsDecimal`](../../reference/cogniscript/system-calls/type-checks.md#typeisdecimal) says whether text reads as a
  number. `!` turns its answer round: "if the weight is not a number".

`boxes` and `total` are declared before the loop, so every turn adds to the same two. A variable declared inside the
loop, such as `weight`, starts again each turn.

**Done when:** you can say what happens to each of the seven parts: `kg` is skipped with a message, the empty one is
skipped silently, and `7` is never reached, because the van is full by then.

## 3. Pack each parcel into boxes

A box holds up to 20 kg, so a heavier parcel goes in several boxes. The app doesn't know in advance how many, so it
uses `while`, which repeats for as long as its condition is true:

<!-- snippet: examples/cogniscript-02-loops/maitento/apps/shipping/shipping.mtc#boxes -->
```c title="maitento/apps/shipping/shipping.mtc"
// A box holds up to 20 kg, so a heavier parcel goes in several. while repeats as long as its condition holds.
decimal left = weight;
while (left > 0) {
	decimal box = MathMin(left, 20);
	left = left - box;

	string size = "";
	decimal price = 0;
	if (box <= 2) {
		size = "small";
		price = 3.5;
	} else if (box <= 10) {
		size = "medium";
		price = 6;
	} else {
		size = "large";
		price = 11;
	}
	price = price * rate;

	boxes = boxes + 1;
	total = total + price;
	PrintLine("Box " + boxes + ": " + box + " kg, " + size + ", " + DecimalToString(price, "0.00"));
}
```
<!-- /snippet -->

Each turn takes up to 20 kg off what's `left` ([`MathMin`](../../reference/cogniscript/system-calls/math.md#mathmin)
gives the smaller of two numbers), so a 45 kg parcel makes boxes of 20, 20 and 5 kg, and then `left > 0` is false and
the loop ends. The box's size is a three-way choice, `if` / `else if` / `else` again, and `boxes = boxes + 1;` counts
it.

A `while` loop ends only when its condition turns false. If nothing in the loop moves it there (take out
`left = left - box;` and `left` never shrinks), the loop runs forever. An app's settings file can cap how long a run
may take, and this one does:

<!-- snippet: examples/cogniscript-02-loops/maitento/apps/shipping/shipping.mtr -->
```hcl title="maitento/apps/shipping/shipping.mtr"
// Stop the app if it runs for more than a minute: a loop whose condition never turns false would run until then.
duration.max = "00:01:00"
```
<!-- /snippet -->

A run that reaches `duration.max` is stopped and ends `Killed`, instead of using up time until something else stops
it.

**Done when:** you can say how many boxes the parcels take before the van is full: six (0.4, 3, 12.5, then 20, 20
and 5 kg for the 45 kg parcel).

## 4. The discount

After the loop, one last decision:

<!-- snippet: examples/cogniscript-02-loops/maitento/apps/shipping/shipping.mtc#discount -->
```c title="maitento/apps/shipping/shipping.mtc"
// && needs both sides to be true: UK orders of 40 or more get 10% off.
if (destination == "UK" && total >= 40) {
	total = total * 0.9;
	PrintLine("10% off UK orders of 40 or more");
}
PrintLine("Total for " + boxes + " boxes: " + DecimalToString(total, "0.00"));
return(DecimalToString(total, "0.00"));
```
<!-- /snippet -->

`&&` needs both sides to be true: the order goes to the UK, **and** it comes to 40 or more. A big order to the EU gets
no discount, and nor does a small one to the UK.

**Done when:** the project validates. Run `mt build ./maitento`, or press **Validate** in the portal's **Build
studio**.

## 5. Run it

<!-- tabs -->
<!-- snippet: examples/cogniscript-02-loops/typescript/shipping.ts -->
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
<!-- snippet: examples/cogniscript-02-loops/python/shipping.py -->
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
<!-- snippet: examples/cogniscript-02-loops/csharp/shipping.cs -->
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

Run it from the language's folder in [`examples/cogniscript-02-loops`](../../../examples/cogniscript-02-loops/):
`node shipping.ts`, `python shipping.py` or `dotnet run shipping.cs`. To quote other parcels, pass the weights and the
destination: `node shipping.ts "2, 8" EU`.

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

Every decision shows: the UK rate, the skipped `kg`, the 45 kg parcel in three boxes, the `break` when the van was
full, and the discount on a total of 48.50.

**Done when:** you see six boxes and `Returned: 43.65`. Try `EU`: every box costs one and a half times as much, and
the total is `72.75`, with no discount.

## All the files

<!-- project: examples/cogniscript-02-loops -->
**On GitHub:** [`examples/cogniscript-02-loops`](https://github.com/maitento/maitento/tree/main/examples/cogniscript-02-loops) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/cogniscript-02-loops/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/cogniscript-02-loops/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/cogniscript-02-loops/csharp)

<details>
<summary>All the files in this project (2)</summary>

<!-- tabs: files -->
**`maitento/apps/shipping/shipping.mtc`**
```c title="maitento/apps/shipping/shipping.mtc"
// The shipping app: it packs a list of parcels into boxes, and quotes the delivery.
// weights is a list of parcel weights in kg, separated by commas: "0.4, 3, 12.5".
string main(string weights, string destination) {
	// region:rate
	// if / else if / else: the first condition that is true picks the rate; else catches the rest.
	decimal rate = 0;
	if (destination == "UK") {
		rate = 1;
	} else if (destination == "EU" || destination == "Europe") {
		rate = 1.5;
	} else {
		rate = 3;
	}
	PrintLine("Shipping to " + destination);
	// endregion

	// region:parcels
	// StringSplit cuts the text at each comma into a list. Lesson 4 covers lists; here you need only
	// how many items it has (JsonArrayCount) and the item at a position (JsonArrayGetAtIndex).
	jsonArray parcels = StringSplit(weights, ",", false);
	int boxes = 0;
	decimal total = 0;
	for (int i = 0; i < JsonArrayCount(parcels); i++) {
		// The van takes six boxes. break leaves the loop at once: the other parcels wait.
		if (boxes == 6) {
			PrintLine("The van is full: the other parcels wait for the next one.");
			break;
		}

		string weight = StringTrim(JsonArrayGetAtIndex(parcels, i));
		// continue skips the rest of this turn of the loop, and goes on to the next parcel.
		if (weight == "") {
			continue;
		}
		// ! turns true into false: "if the weight is not a number".
		if (!TypeIsDecimal(weight)) {
			PrintLine("Skipped \"" + weight + "\": not a weight in kg");
			continue;
		}
		// endregion

		// region:boxes
		// A box holds up to 20 kg, so a heavier parcel goes in several. while repeats as long as its condition holds.
		decimal left = weight;
		while (left > 0) {
			decimal box = MathMin(left, 20);
			left = left - box;

			string size = "";
			decimal price = 0;
			if (box <= 2) {
				size = "small";
				price = 3.5;
			} else if (box <= 10) {
				size = "medium";
				price = 6;
			} else {
				size = "large";
				price = 11;
			}
			price = price * rate;

			boxes = boxes + 1;
			total = total + price;
			PrintLine("Box " + boxes + ": " + box + " kg, " + size + ", " + DecimalToString(price, "0.00"));
		}
		// endregion
	}

	// region:discount
	// && needs both sides to be true: UK orders of 40 or more get 10% off.
	if (destination == "UK" && total >= 40) {
		total = total * 0.9;
		PrintLine("10% off UK orders of 40 or more");
	}
	PrintLine("Total for " + boxes + " boxes: " + DecimalToString(total, "0.00"));
	return(DecimalToString(total, "0.00"));
	// endregion
}
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

Send the destination in lower case:

<!-- tabs -->
```bash title="TypeScript"
node shipping.ts "0.4, 3, kg, 12.5, , 45, 7" uk
```
```bash title="Python"
python shipping.py "0.4, 3, kg, 12.5, , 45, 7" uk
```
```bash title="C#"
dotnet run shipping.cs "0.4, 3, kg, 12.5, , 45, 7" uk
```
```bash title="CLI"
mt app-run shipping --input-weights "0.4, 3, kg, 12.5, , 45, 7" --input-destination "uk"
```
<!-- /tabs -->

```text
Shipping to uk
Box 1: 0.4 kg, small, 10.50
Box 2: 3 kg, medium, 18.00
Skipped "kg": not a weight in kg
Box 3: 12.5 kg, large, 33.00
Box 4: 20 kg, large, 33.00
Box 5: 20 kg, large, 33.00
Box 6: 5 kg, medium, 18.00
The van is full: the other parcels wait for the next one.
Total for 6 boxes: 145.50

Returned: 145.50
```

The customer in the UK paid the rest-of-the-world rate, and lost the discount. `==` compares text exactly, so `uk`
matched neither `UK` nor `EU`, and `else` caught it. Nothing failed, which is what makes this kind of mistake
expensive. Make the comparison see past the case: put this as the first line of `main`, and the same run returns
`43.65` again.

```c
	destination = StringToUpper(destination);
```

## If it didn't work

- **Every box costs the rest-of-the-world rate.** The destination didn't match `UK` or `EU` exactly: check its case
  and its spaces, as above.
- **A parcel is "Skipped" though it has a weight.** `TypeIsDecimal` wants a number and nothing else: `3kg` and
  `3 kg` aren't numbers. Send `3`.
- **The run ends `Killed` after a minute, with "App process exceeded its execution time limit and was terminated".**
  A loop never ended: check that something in a `while` loop moves its condition towards false.
- **The deploy fails with "Argument count mismatch for StringSplit (shipping.mtc:20)".** Pass all three arguments:
  `StringSplit(weights, ",", false)`.

## Review

You built:

- a shipping app that picks a rate, packs a list of parcels into boxes, skips what it can't weigh, stops when the van
  is full and applies a discount;
- a script that quotes any parcels to any destination.

The concepts:

- Comparisons: `==` and `!=` compare text exactly; `<`, `<=`, `>` and `>=` compare numbers. A comparison is a `bool`,
  printed as `True` or `False`.
- Conditions combine with `&&` (both), `||` (either) and `!` (not).
- `if` / `else if` / `else` runs the first block whose condition is true, or the `else`.
- `for` repeats a counted number of times; `while` repeats until its condition turns false. `continue` skips to the
  next turn; `break` leaves the loop.
- `duration.max` in an app's `.mtr` file stops a run that goes on too long. The full syntax is in the
  [Cogniscript language reference](../../reference/cogniscript/index.md).

**Challenge:** tell the customer what's going: after the total, print the weight of the parcels in the van and the
heaviest of them, as `In the van: 60.9 kg. Heaviest parcel: 45 kg`. Count only parcels that get past the checks. The
solution is in [`examples/cogniscript-02-loops/solution`](../../../examples/cogniscript-02-loops/solution/): a new
app, `shipping-report`.

**Next:** [3. Functions and files](3-functions.md) splits this app into functions, over two files, without changing
what it does.
