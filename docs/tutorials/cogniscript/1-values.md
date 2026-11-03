---
title: 1. Values and text
description: Variables and their types, decimal arithmetic, when + adds and when it joins, and the calls that turn numbers into text.
sidebar:
  order: 101
---

# 1. Values and text

Print a till receipt: take an item, a price and a quantity, work out the tax and the total, and line the amounts up.
It's a small app, but it uses most of what you do with values in Cogniscript: hold them in variables, do sums with
them, and turn them into text a person can read. One fact explains most of what follows: every value is held as text.

> **You'll learn**
>
> - how to declare a variable, what the types are, and why every value is text underneath
> - why arithmetic is decimal, so money adds up exactly
> - when `+` adds and when it joins, and how brackets decide
> - how to write a number as text the way you want it, and the calls that change text
> - how `PrintLine` and `return` report back to the code that ran the app
>
> **New concepts:** [values and types](../../concepts/cogniscript.md) ·
> [operators](../../reference/cogniscript/index.md#operators) · system calls for
> [text](../../reference/cogniscript/system-calls/strings.md), [numbers](../../reference/cogniscript/system-calls/math.md)
> and [conversion](../../reference/cogniscript/system-calls/conversion.md)
>
> **Builds on:** [16. Apps](../16-apps.md) (an app's folder, `main`, its inputs and how a script runs it)
>
> **Time:** ~15 min · **Cost:** nothing: the app uses only the standard library, no AI · **Needs:** nothing beyond
> Get started

## 1. The app's inputs

The project is one app, `apps/receipt/`, with one file, `receipt.mtc`. As in [tutorial 16](../16-apps.md), the app
starts at `main`, and `main`'s parameters are the app's inputs:

```c
string main(string item, decimal price, int quantity) {
```

So this app has three inputs: `item`, `price` and `quantity`. Each parameter, like each variable, has a **type**:

| Type | Holds | Example |
|---|---|---|
| `string` | text | `"Notebook"` |
| `int` | a whole number | `3` |
| `decimal` | a number with a fraction | `4.5` |
| `bool` | `true` or `false` | `true` |
| `guid` | an id | the id `InteractionStart` returns |
| `date` | a date and time | what `DateGetUtc()` returns |
| `jsonObject`, `jsonArray` | JSON | lesson 4 |

`string main` says `main` returns text. Every input arrives as text, whatever its type: the script sends `"4.5"` and
`"3"`. That isn't a special rule for inputs. **Every value in Cogniscript is held as text**, and a type says what you
mean the text to hold. Nothing converts or checks it: `int count = 4.5;` is allowed, and `count` holds `4.5`. So treat
types as notes for the next person who reads your code, and check values yourself where it matters
([lesson 5](5-errors.md) shows how).

A variable is declared with its type and must be given a value straight away: `decimal total = 0;`, never
`decimal total;`.

**Done when:** you can say what the app's inputs are called, and what the script sends for `price` (the text `"4.5"`).

## 2. Do the sums

A value that reads as a number can be used as one. The app works out the subtotal, the tax and the total:

<!-- snippet: examples/cogniscript-01-values/maitento/apps/receipt/receipt.mtc#sums -->
```c title="maitento/apps/receipt/receipt.mtc"
// Arithmetic is decimal, so money comes out exact: 4.5 * 3 is 13.5, never 13.499999.
decimal subtotal = price * quantity;
// Tax is 20%, rounded to two decimal places.
decimal tax = MathRound(subtotal * 0.2, 2);
decimal total = subtotal + tax;
```
<!-- /snippet -->

**Arithmetic is decimal**, so money comes out exact. There is no floating-point rounding error, and dividing never
drops the fraction, even between two `int`s:

| You write | You get |
|---|---|
| `7 / 2` | `3.5` |
| `0.1 + 0.2` | `0.3` |
| `4.50 * 3` | `13.50`: a number keeps its decimal places |
| `MathRound(2.345, 2)` | `2.34` |
| `MathRound(2.355, 2)` | `2.36` |

[`MathRound`](../../reference/cogniscript/system-calls/math.md#mathround) rounds to a number of decimal places. A value
exactly halfway rounds to the even digit, as the last two rows show. Here the tax on 13.5 is exactly 2.70, so nothing
is lost.

**Done when:** you can say what `subtotal`, `tax` and `total` hold for a price of 4.5 and a quantity of 3: `13.5`,
`2.70` and `16.20`.

## 3. Write the receipt

Now the app turns the numbers into lines of text:

<!-- snippet: examples/cogniscript-01-values/maitento/apps/receipt/receipt.mtc#receipt -->
```c title="maitento/apps/receipt/receipt.mtc"
// A string call returns a new value: item itself is unchanged.
string name = StringToUpper(item);

// + joins text. DecimalToString writes a number the way you ask: "0.00" is always two decimal places.
// StringPadLeft adds spaces on the left, so the amounts line up on the right.
PrintLine("RECEIPT");
PrintLine(quantity + " x " + name + " at " + DecimalToString(price, "0.00"));
PrintLine("Subtotal  " + StringPadLeft(DecimalToString(subtotal, "0.00"), 8, " "));
PrintLine("Tax 20%   " + StringPadLeft(DecimalToString(tax, "0.00"), 8, " "));
PrintLine("Total     " + StringPadLeft(DecimalToString(total, "0.00"), 8, " "));
```
<!-- /snippet -->

**`+` adds two numbers, and joins anything else.** Because every value is text, `+` looks at the two values in front
of it: when both read as numbers, it adds them; otherwise it joins them. It works from left to right, and brackets go
first:

| You write | You get | Why |
|---|---|---|
| `"1" + "2"` | `3` | both read as numbers, so they're added, quotes or not |
| `StringConcatenate("1", "2")` | `12` | [`StringConcatenate`](../../reference/cogniscript/system-calls/strings.md#stringconcatenate) always joins |
| `quantity + 1` | `4` | `quantity` arrived as the text `"3"`, and it still adds |
| `"Total " + 13.5 + 2.7` | `Total 13.52.7` | `"Total "` + `13.5` joins; then that text + `2.7` joins too |
| `"Total " + (13.5 + 2.7)` | `Total 16.2` | the brackets add first |

So `quantity + " x " + name` joins: there's text in the middle. To join two numbers, use `StringConcatenate`.

The calls that shape the text:

- [`DecimalToString(value, format)`](../../reference/cogniscript/system-calls/conversion.md#decimaltostring) writes a
  number as text in the format you give: `"0.00"` is always two decimal places, so `13.5` becomes `13.50`.
- [`StringToUpper(text)`](../../reference/cogniscript/system-calls/strings.md#stringtoupper) returns the text in
  capitals. A string call returns a new value: `item` itself doesn't change.
- [`StringPadLeft(text, width, character)`](../../reference/cogniscript/system-calls/strings.md#stringpadleft) adds
  spaces on the left up to `width` characters, so the amounts line up on the right.
- [`PrintLine(text)`](../../reference/cogniscript/system-calls/console.md#printline) writes one line to the run's
  console.

**A system call takes every argument**, even one that looks optional: `StringPadLeft` needs its `" "`. The other
conversions go the other way: [`StringToDecimal`](../../reference/cogniscript/system-calls/conversion.md#stringtodecimal)
and [`StringToInt`](../../reference/cogniscript/system-calls/conversion.md#stringtoint) check that text is a number,
and stop the run when it isn't.

**Done when:** you can say why the first line printed is `3 x NOTEBOOK at 4.50` and not a sum.

## 4. Return the total

<!-- snippet: examples/cogniscript-01-values/maitento/apps/receipt/receipt.mtc#return -->
```c title="maitento/apps/receipt/receipt.mtc"
// return ends the run. What it returns is the run's return value.
return(DecimalToString(total, "0.00"));
```
<!-- /snippet -->

`return(...)` ends the run, and what it returns becomes the run's **return value**. It needs its brackets. The return
value is text too: `16.20`, written with `DecimalToString`, so it always has two decimal places.

**Done when:** the project validates. Run `mt build ./maitento`, or press **Validate** in the portal's **Build
studio**.

## 5. Run it

Each script deploys the project, runs the app with your inputs (or the ones in the script), and prints what the run
reported:

<!-- tabs -->
<!-- snippet: examples/cogniscript-01-values/typescript/receipt.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// Run the receipt app. Its main(string item, decimal price, int quantity) parameters are its inputs,
// and every input goes in as text.
const [item = "Notebook", price = "4.5", quantity = "3"] = process.argv.slice(2);
const run = await mt.apps.run("receipt", { inputs: { item, price, quantity } });

// What the app printed, what it returned, and every named output, in the order the app first set them.
for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nReturned: ${run.returnValue}`);
for (const output of run.outputs) console.log(`Output "${output.name}": ${output.value}`);
```
<!-- /snippet -->
<!-- snippet: examples/cogniscript-01-values/python/receipt.py -->
```python title="Python"
import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# Run the receipt app. Its main(string item, decimal price, int quantity) parameters are its inputs,
# and every input goes in as text.
args = sys.argv[1:]
item = args[0] if len(args) > 0 else "Notebook"
price = args[1] if len(args) > 1 else "4.5"
quantity = args[2] if len(args) > 2 else "3"
run = mt.apps.run("receipt", inputs={"item": item, "price": price, "quantity": quantity})

# What the app printed, what it returned, and every named output, in the order the app first set them.
for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nReturned: {run.return_value}")
for output in run.outputs:
    print(f'Output "{output.name}": {output.value}')
```
<!-- /snippet -->
<!-- snippet: examples/cogniscript-01-values/csharp/receipt.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// Run the receipt app. Its main(string item, decimal price, int quantity) parameters are its inputs,
// and every input goes in as text.
var item = args.Length > 0 ? args[0] : "Notebook";
var price = args.Length > 1 ? args[1] : "4.5";
var quantity = args.Length > 2 ? args[2] : "3";
var run = await mt.Apps.RunAsync("receipt", new Dictionary<string, string> { ["item"] = item, ["price"] = price, ["quantity"] = quantity });

// What the app printed, what it returned, and every named output, in the order the app first set them.
foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nReturned: {run.ReturnValue}");
foreach (var output in run.Outputs) Console.WriteLine($"Output \"{output.Name}\": {output.Value}");
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt app-run receipt --input-item "Notebook" --input-price "4.5" --input-quantity "3"
```
<!-- /tabs -->

Run it from the language's folder in [`examples/cogniscript-01-values`](../../../examples/cogniscript-01-values/):
`node receipt.ts`, `python receipt.py` or `dotnet run receipt.cs`. To price something else, pass the three inputs:
`node receipt.ts Pen 1.2 10`.

```text
RECEIPT
3 x NOTEBOOK at 4.50
Subtotal     13.50
Tax 20%       2.70
Total        16.20

Returned: 16.20
```

The app sets no named outputs, so there are no `Output` lines. The portal's **Runs** shows the same run: its
**Console** tab holds the five lines.

**Done when:** you see the receipt and `Returned: 16.20`.

## All the files

<!-- project: examples/cogniscript-01-values -->
**On GitHub:** [`examples/cogniscript-01-values`](https://github.com/maitento/maitento/tree/main/examples/cogniscript-01-values) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/cogniscript-01-values/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/cogniscript-01-values/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/cogniscript-01-values/csharp)

<details>
<summary>All the files in this project (1)</summary>

<!-- tabs: files -->
**`maitento/apps/receipt/receipt.mtc`**
```c title="maitento/apps/receipt/receipt.mtc"
// The receipt app: it works out what an order costs, then prints a receipt for it.
// main's parameters are the app's inputs. Each one arrives as text; its type says what the text should hold.
string main(string item, decimal price, int quantity) {
	// region:sums
	// Arithmetic is decimal, so money comes out exact: 4.5 * 3 is 13.5, never 13.499999.
	decimal subtotal = price * quantity;
	// Tax is 20%, rounded to two decimal places.
	decimal tax = MathRound(subtotal * 0.2, 2);
	decimal total = subtotal + tax;
	// endregion

	// region:receipt
	// A string call returns a new value: item itself is unchanged.
	string name = StringToUpper(item);

	// + joins text. DecimalToString writes a number the way you ask: "0.00" is always two decimal places.
	// StringPadLeft adds spaces on the left, so the amounts line up on the right.
	PrintLine("RECEIPT");
	PrintLine(quantity + " x " + name + " at " + DecimalToString(price, "0.00"));
	PrintLine("Subtotal  " + StringPadLeft(DecimalToString(subtotal, "0.00"), 8, " "));
	PrintLine("Tax 20%   " + StringPadLeft(DecimalToString(tax, "0.00"), 8, " "));
	PrintLine("Total     " + StringPadLeft(DecimalToString(total, "0.00"), 8, " "));
	// endregion

	// region:return
	// return ends the run. What it returns is the run's return value.
	return(DecimalToString(total, "0.00"));
	// endregion
}
```
<!-- /tabs -->

</details>

<!-- /project -->

## Break it on purpose

First, let `+` join what you meant to add. Change the last line of the receipt to print the total straight from the
two amounts:

```c
	PrintLine("Total     " + subtotal + tax);
```

Run it again. The last line is now:

```text
Total     13.52.70
```

`"Total     " + subtotal` is text, so adding `tax` to it joins as well. Brackets would add first,
`"Total     " + (subtotal + tax)`, but a variable for the total, as the app has, is clearer. Change the line back.

Then send a price the way much of Europe writes it, with a comma:

<!-- tabs -->
```bash title="TypeScript"
node receipt.ts Notebook 4,5 3
```
```bash title="Python"
python receipt.py Notebook 4,5 3
```
```bash title="C#"
dotnet run receipt.cs Notebook 4,5 3
```
```bash title="CLI"
mt app-run receipt --input-item "Notebook" --input-price "4,5" --input-quantity "3"
```
<!-- /tabs -->

```text
RECEIPT
3 x NOTEBOOK at 45.00
Subtotal    135.00
Tax 20%      27.00
Total       162.00

Returned: 162.00
```

The run finished, and charged ten times too much. The input arrived as the text `4,5`, and `decimal` didn't check it.
When the app multiplied it, the text read as a number with the comma as a thousands separator: 45. A type can't
protect you from an input like this. Checking it can, and [lesson 5](5-errors.md) does.

## If it didn't work

- **The deploy fails with "Argument count mismatch for StringPadLeft (receipt.mtc:21)".** A system call takes every
  argument. Pass the padding character, `" "`, as the third.
- **The deploy fails with "Could not parse all tokens in statement (receipt.mtc:27)".** Usually `return` without its
  brackets (`return(total);`, not `return total;`), or a variable declared without a value (`decimal total;`). The
  number after the file name is the line.
- **The run fails with "… is not a valid decimal".** An input that the app does arithmetic with isn't a number, such as
  a price of `four`. Pass digits, with a dot for the decimal point.
- **The start is refused with `api:apps:input-missing`.** Every input is required. Send all three, even an empty one.
- **`No namespace`** or **`Project folder not found: ../maitento`**: see [tutorial 1](../01-hello-agent.md#if-it-didnt-work).

## Review

You built:

- a receipt app that does sums with exact decimal arithmetic and lines up the amounts;
- a script that runs it with three inputs, and prints its console and its return value.

The concepts:

- [Values and types](../../concepts/cogniscript.md): every value is text. A type (`string`, `int`, `decimal`,
  `bool`, `guid`, `date`, `jsonObject`, `jsonArray`) says what you mean it to hold; nothing checks it.
- Arithmetic is decimal: `7 / 2` is `3.5`, and `0.1 + 0.2` is `0.3`.
- `+` adds when both sides read as numbers, and joins otherwise, from left to right. Brackets go first.
  `StringConcatenate` always joins.
- Conversions: `DecimalToString(value, "0.00")` writes a number the way you want it. `StringToDecimal` and
  `StringToInt` check that text is a number.
- `PrintLine` writes to the run's console; `return(...)` sets the run's return value and ends it. The full syntax is in
  the [Cogniscript language reference](../../reference/cogniscript/index.md).

**Challenge:** add a fourth input, `discount`: a percentage taken off the subtotal before the tax. Print it as its own
line, such as `Less 10%     -1.35`, lined up with the others. With a discount of 10, the total is `14.58`. The
solution is in [`examples/cogniscript-01-values/solution`](../../../examples/cogniscript-01-values/solution/): a new
app, `discount-receipt`, which uses
[`StringPadRight`](../../reference/cogniscript/system-calls/strings.md#stringpadright) to line up its labels.

**Next:** [2. Decisions and loops](2-decisions-and-loops.md) quotes delivery for a list of parcels, with `if`, `for`
and `while`.
