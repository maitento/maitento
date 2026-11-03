---
title: 4. JSON in and out
description: Send an app structured input as JSON, read nested objects and lists, and publish the result as typed named outputs.
sidebar:
  order: 104
---

# 4. JSON in and out

Summarise an order: who it's for, what's in it and what it comes to. An app's inputs always arrive as text, so
structured data, such as an order with a customer and a list of items, travels as one input that holds JSON. The app
turns that text into JSON it can read, walks through it, and hands the result back as **named outputs**. Each output
has a type, so the code that runs the app gets a number, a true or false, or a list, not a sentence to pick apart.

> **You'll learn**
>
> - how to turn an input's text into a JSON object you can read
> - how to read a plain value, an object inside an object and a list of objects, and what a missing key gives you
> - how to build a JSON object and a list for the result, and what the JSON calls can't store
> - how to publish typed named outputs, and read them back in TypeScript, Python and C#
>
> **New concepts:** [JSON values](../../concepts/cogniscript.md) (`jsonObject`, `jsonArray`) ·
> [typed named outputs](../../concepts/apps.md#what-an-app-produces)
>
> **Builds on:** [3. Functions and files](3-functions.md)
>
> **Time:** ~15 min · **Cost:** nothing: the app uses only the standard library, no AI · **Needs:** nothing beyond
> Get started

## 1. The order

The project has no agents this time: one app, `apps/order-summary/`, and the order it reads, in `data/order.json`:

<!-- snippet: examples/cogniscript-04-json/data/order.json -->
```json title="data/order.json"
{
  "id": "A-1001",
  "customer": {
    "name": "Ada Lovelace",
    "address": { "city": "London", "country": "UK" }
  },
  "items": [
    { "name": "Bamboo cup", "quantity": 2, "price": 12.5 },
    { "name": "Spare lid", "quantity": 1, "price": 3 },
    { "name": "Cleaning brush", "quantity": 3, "price": 1.99 }
  ],
  "giftWrap": true
}
```
<!-- /snippet -->

The scripts send this file, as it is, as the app's one input, `order`. The app's `main` is `string main(string order)`:
however much structure the text holds, it reaches the app as a `string`. Before the app can read anything in it, it
has to turn the text into JSON.

**Done when:** you can say what type `order` has when it reaches `main`, and why.

## 2. Read a value, and an object inside an object

<!-- snippet: examples/cogniscript-04-json/maitento/apps/order-summary/order-summary.mtc#read -->
```c title="maitento/apps/order-summary/order-summary.mtc"
// Every input arrives as text. StringToJsonObject checks that the text is a JSON object, so you can read it.
jsonObject parsed = StringToJsonObject(order);

// A plain value: JsonObjectGet gives its text.
string id = JsonObjectGet(parsed, "id");

// A nested object: read the object out, then read inside it.
jsonObject customer = JsonObjectGet(parsed, "customer");
string name = JsonObjectGet(customer, "name");
jsonObject address = JsonObjectGet(customer, "address");
string city = JsonObjectGet(address, "city");
PrintLine("Order " + id + " for " + name + " in " + city);
```
<!-- /snippet -->

- [`StringToJsonObject`](../../reference/cogniscript/system-calls/conversion.md#stringtojsonobject) checks that the
  text is a JSON object, and gives it back as a `jsonObject`. When the text isn't JSON, or is a list rather than an
  object, the run stops there with an error. A list that arrives as text goes through
  [`StringToJsonArray`](../../reference/cogniscript/system-calls/conversion.md#stringtojsonarray) instead.
- [`JsonObjectGet`](../../reference/cogniscript/system-calls/json.md#jsonobjectget) gives a value's text: `"A-1001"`
  comes back as `A-1001`, the number `2` as `2`.
- For an object inside an object, `JsonObjectGet` gives that object's JSON. Put it in a `jsonObject` and read inside
  it. Each call goes down one level: `customer`, then `address`, then `city`.

**Done when:** you can name the three `JsonObjectGet` calls that lead to `London`.

## 3. Walk a list of objects

<!-- snippet: examples/cogniscript-04-json/maitento/apps/order-summary/order-summary.mtc#items -->
```c title="maitento/apps/order-summary/order-summary.mtc"
// An array of objects: count it, then read each object by its index, starting at 0.
jsonArray items = JsonObjectGet(parsed, "items");
int itemCount = JsonArrayCount(items);
decimal total = 0;
jsonArray lines = JsonArrayCreate();
for (int i = 0; i < itemCount; i++) {
	jsonObject item = JsonArrayGetAtIndex(items, i);
	string quantity = JsonObjectGet(item, "quantity");
	decimal lineTotal = quantity * JsonObjectGet(item, "price");
	total = total + lineTotal;
	string line = quantity + " x " + JsonObjectGet(item, "name") + " = " + DecimalToString(lineTotal, "0.00");
	PrintLine("- " + line);
	lines = JsonArrayAdd(lines, line);
}
```
<!-- /snippet -->

- A list is a `jsonArray`. [`JsonArrayCount`](../../reference/cogniscript/system-calls/json.md#jsonarraycount) says
  how many entries it has, and
  [`JsonArrayGetAtIndex`](../../reference/cogniscript/system-calls/json.md#jsonarraygetatindex) reads one, counting
  from 0. Each item here is an object, read like any other.
- Numbers come out of JSON as text, and arithmetic still works on them: `quantity * price` is `2 * 12.5`, which is
  `25.0`. Arithmetic is decimal, so it keeps the decimal places it's given.
  [`DecimalToString`](../../reference/cogniscript/system-calls/conversion.md#decimaltostring) with `"0.00"` writes
  an amount with exactly two.
- [`JsonArrayAdd`](../../reference/cogniscript/system-calls/json.md#jsonarrayadd) returns a new list with the entry
  added, so assign it back: `lines = JsonArrayAdd(lines, line);`. Text that isn't JSON, like each line here, goes in
  as a JSON string. Text that is JSON, such as `42` or an object, goes in as that value.

**Done when:** you can say what `lines` holds after the loop.

## 4. Allow for what's missing

<!-- snippet: examples/cogniscript-04-json/maitento/apps/order-summary/order-summary.mtc#missing -->
```c title="maitento/apps/order-summary/order-summary.mtc"
// A key that isn't there reads as empty text, so check for "" before you rely on it.
string note = JsonObjectGet(parsed, "note");
if (note == "") {
	note = "none";
}
PrintLine("Note: " + note);

// JSON's true reads as the text "true". Comparing with it gives false when the key is missing, too.
bool giftWrap = JsonObjectGet(parsed, "giftWrap") == "true";
if (giftWrap) {
	PrintLine("Gift wrap: yes");
}
```
<!-- /snippet -->

- **A key that isn't there reads as empty text**, and so does JSON's `null`. No value is ever null, so `TypeIsNull`
  can't tell you a key is missing: compare with `""`.
- **True and false come in two spellings.** JSON's `true` reads as the text `true`, but a comparison or a `bool`
  literal gives `True`. `==` compares text exactly, so the safe test is the one the app makes: compare with `"true"`.
  That gives `false` for a missing key too.
- **Reading inside an object that isn't there stops the run.** An order with no `customer` fails at the first
  `JsonObjectGet(customer, …)`. Check with `== ""` first when a key may be missing.
  [Lesson 5](5-errors.md) is about checks like that.

**Done when:** you can say what the app prints for the order in `data/order.json`, which has no `note`.

## 5. Build the result, and publish it

<!-- snippet: examples/cogniscript-04-json/maitento/apps/order-summary/order-summary.mtc#result -->
```c title="maitento/apps/order-summary/order-summary.mtc"
// Build a JSON object for the result. Each helper returns a new object, so assign it back.
jsonObject summary = JsonObjectCreate();
summary = JsonObjectSetString(summary, "order", id);
summary = JsonObjectSetString(summary, "customer", name);
summary = JsonObjectSetString(summary, "city", city);
summary = JsonObjectSetBool(summary, "giftWrap", giftWrap);
// The Set calls store only text, and true or false. To put a number or a list in an object, merge it in with
// JsonAtaTransform, which runs a JSONata expression over the object.
summary = JsonAtaTransform(summary, "$merge([$, {'total': " + total + ", 'lines': " + lines + "}])");

// Typed named outputs: one call for each type. Your code reads them back from the finished run.
AppStateSetOutputInteger("itemCount", itemCount);
AppStateSetOutputDecimal("total", total);
AppStateSetOutputBool("giftWrap", giftWrap);
AppStateSetOutputJsonArray("lines", lines);
AppStateSetOutputJsonObject("summary", summary);
return("Order " + id + ": " + itemCount + " items, " + DecimalToString(total, "0.00"));
```
<!-- /snippet -->

Building a JSON object:

- [`JsonObjectCreate`](../../reference/cogniscript/system-calls/json.md#jsonobjectcreate) makes an empty one.
  [`JsonObjectSetString`](../../reference/cogniscript/system-calls/json.md#jsonobjectsetstring) and
  [`JsonObjectSetBool`](../../reference/cogniscript/system-calls/json.md#jsonobjectsetbool) each return a new object
  with one key set, so assign it back.
- **Those two are the only Set calls, so an object can only be given text, and true or false, that way.** There's no
  call that sets a number, a list or another object inside an object: `JsonObjectSetString(summary, "total", total)`
  would store `"33.97"`, in quotes.
- To put a number or a list in, merge it in with
  [`JsonAtaTransform`](../../reference/cogniscript/system-calls/json.md#jsonatatransform), which runs a
  [JSONata](https://jsonata.org) expression over the object. `$merge([$, {…}])` gives back the object with those keys
  added. The app joins the values into the expression as JSON: `total` as a number, `lines` as its list. Join only
  numbers and JSON this way. Text would need quoting first.

Publishing it: each `AppStateSetOutput…` call publishes one **named output**, and the call you choose sets its type.

| Call | The output's type | Its value on the run |
|---|---|---|
| [`AppStateSetOutputString`](../../reference/cogniscript/system-calls/apps.md#appstatesetoutputstring) | `String` | the text |
| [`AppStateSetOutputInteger`](../../reference/cogniscript/system-calls/apps.md#appstatesetoutputinteger) | `Integer` | `3` |
| [`AppStateSetOutputDecimal`](../../reference/cogniscript/system-calls/apps.md#appstatesetoutputdecimal) | `Decimal` | `33.97` |
| [`AppStateSetOutputBool`](../../reference/cogniscript/system-calls/apps.md#appstatesetoutputbool) | `Bool` | `True` or `False` |
| [`AppStateSetOutputGuid`](../../reference/cogniscript/system-calls/apps.md#appstatesetoutputguid), [`AppStateSetOutputDate`](../../reference/cogniscript/system-calls/apps.md#appstatesetoutputdate) | `Guid`, `Date` | the id, the date |
| [`AppStateSetOutputJsonArray`](../../reference/cogniscript/system-calls/apps.md#appstatesetoutputjsonarray) | `JsonArray` | the list, as JSON |
| [`AppStateSetOutputJsonObject`](../../reference/cogniscript/system-calls/apps.md#appstatesetoutputjsonobject) | `JsonObject` | the object, as JSON |

Why outputs rather than one return value? `return(...)` gives the run one piece of text. Outputs are named, so the
code that runs the app takes just the ones it needs, and each carries its type, so that code knows a `Decimal` is a
number and a `JsonArray` is a list to parse. Setting the same name again replaces its value.

**Done when:** the project validates. Run `mt build ./maitento`, or press **Validate** in the portal's
**Build studio**.

## 6. Run it

Run the scripts from the language's folder in
[`examples/cogniscript-04-json`](../../../examples/cogniscript-04-json/), as in the
[track's overview](index.md). Each one reads `data/order.json` and sends it as the `order` input. To send an order of
your own, pass its JSON as the first argument.

<!-- tabs -->
<!-- snippet: examples/cogniscript-04-json/typescript/summary.ts -->
```ts title="TypeScript"
import { readFileSync } from "node:fs";
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// The order goes in as JSON text: an app's inputs are always text.
const order = process.argv[2] ?? readFileSync("../data/order.json", "utf8");
const run = await mt.apps.run("order-summary", { inputs: { order } });

// What the app printed, what it returned, and every named output, in the order the app first set them.
for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
console.log(`\nReturned: ${run.returnValue}`);
for (const output of run.outputs) console.log(`Output "${output.name}": ${output.value}`);
```
<!-- /snippet -->
<!-- snippet: examples/cogniscript-04-json/python/summary.py -->
```python title="Python"
import sys
from pathlib import Path

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# The order goes in as JSON text: an app's inputs are always text.
order = sys.argv[1] if len(sys.argv) > 1 else Path("../data/order.json").read_text(encoding="utf-8")
run = mt.apps.run("order-summary", inputs={"order": order})

# What the app printed, what it returned, and every named output, in the order the app first set them.
for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nReturned: {run.return_value}")
for output in run.outputs:
    print(f'Output "{output.name}": {output.value}')
```
<!-- /snippet -->
<!-- snippet: examples/cogniscript-04-json/csharp/summary.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// The order goes in as JSON text: an app's inputs are always text.
var order = args.Length > 0 ? args[0] : File.ReadAllText("../data/order.json");
var run = await mt.Apps.RunAsync("order-summary", new Dictionary<string, string> { ["order"] = order });

// What the app printed, what it returned, and every named output, in the order the app first set them.
foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nReturned: {run.ReturnValue}");
foreach (var output in run.Outputs) Console.WriteLine($"Output \"{output.Name}\": {output.Value}");
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt app-run order-summary --input-order "$(cat data/order.json)"
```
<!-- /tabs -->

```text
Order A-1001 for Ada Lovelace in London
- 2 x Bamboo cup = 25.00
- 1 x Spare lid = 3.00
- 3 x Cleaning brush = 5.97
Note: none
Gift wrap: yes

Returned: Order A-1001: 3 items, 33.97
Output "itemCount": 3
Output "total": 33.97
Output "giftWrap": True
Output "lines": ["2 x Bamboo cup = 25.00","1 x Spare lid = 3.00","3 x Cleaning brush = 5.97"]
Output "summary": {"order":"A-1001","customer":"Ada Lovelace","city":"London","giftWrap":true,"total":33.97,"lines":["2 x Bamboo cup = 25.00","1 x Spare lid = 3.00","3 x Cleaning brush = 5.97"]}
```

The outputs come back in the order the app first set them, each with its `name`, `type` and `value`. The value is
always text, so parse the JSON ones in your code: `JSON.parse(output.value)` in TypeScript, `json.loads` in Python,
`JsonDocument.Parse` in C#. In `summary`, `total` is a real number and `lines` a real list, thanks to the merge. A
`Bool` output's value is `True` or `False`.

**Done when:** you see five outputs and `Returned: Order A-1001: 3 items, 33.97`.

## All the files

<!-- project: examples/cogniscript-04-json -->
**On GitHub:** [`examples/cogniscript-04-json`](https://github.com/maitento/maitento/tree/main/examples/cogniscript-04-json) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/cogniscript-04-json/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/cogniscript-04-json/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/cogniscript-04-json/csharp)

<details>
<summary>All the files in this project (2)</summary>

<!-- tabs: files -->
**`maitento/apps/order-summary/order-summary.mtc`**
```c title="maitento/apps/order-summary/order-summary.mtc"
// The order-summary app: it reads an order sent as JSON, totals it, and publishes the result as typed named outputs.
string main(string order) {
	// region:read
	// Every input arrives as text. StringToJsonObject checks that the text is a JSON object, so you can read it.
	jsonObject parsed = StringToJsonObject(order);

	// A plain value: JsonObjectGet gives its text.
	string id = JsonObjectGet(parsed, "id");

	// A nested object: read the object out, then read inside it.
	jsonObject customer = JsonObjectGet(parsed, "customer");
	string name = JsonObjectGet(customer, "name");
	jsonObject address = JsonObjectGet(customer, "address");
	string city = JsonObjectGet(address, "city");
	PrintLine("Order " + id + " for " + name + " in " + city);
	// endregion

	// region:items
	// An array of objects: count it, then read each object by its index, starting at 0.
	jsonArray items = JsonObjectGet(parsed, "items");
	int itemCount = JsonArrayCount(items);
	decimal total = 0;
	jsonArray lines = JsonArrayCreate();
	for (int i = 0; i < itemCount; i++) {
		jsonObject item = JsonArrayGetAtIndex(items, i);
		string quantity = JsonObjectGet(item, "quantity");
		decimal lineTotal = quantity * JsonObjectGet(item, "price");
		total = total + lineTotal;
		string line = quantity + " x " + JsonObjectGet(item, "name") + " = " + DecimalToString(lineTotal, "0.00");
		PrintLine("- " + line);
		lines = JsonArrayAdd(lines, line);
	}
	// endregion

	// region:missing
	// A key that isn't there reads as empty text, so check for "" before you rely on it.
	string note = JsonObjectGet(parsed, "note");
	if (note == "") {
		note = "none";
	}
	PrintLine("Note: " + note);

	// JSON's true reads as the text "true". Comparing with it gives false when the key is missing, too.
	bool giftWrap = JsonObjectGet(parsed, "giftWrap") == "true";
	if (giftWrap) {
		PrintLine("Gift wrap: yes");
	}
	// endregion

	// region:result
	// Build a JSON object for the result. Each helper returns a new object, so assign it back.
	jsonObject summary = JsonObjectCreate();
	summary = JsonObjectSetString(summary, "order", id);
	summary = JsonObjectSetString(summary, "customer", name);
	summary = JsonObjectSetString(summary, "city", city);
	summary = JsonObjectSetBool(summary, "giftWrap", giftWrap);
	// The Set calls store only text, and true or false. To put a number or a list in an object, merge it in with
	// JsonAtaTransform, which runs a JSONata expression over the object.
	summary = JsonAtaTransform(summary, "$merge([$, {'total': " + total + ", 'lines': " + lines + "}])");

	// Typed named outputs: one call for each type. Your code reads them back from the finished run.
	AppStateSetOutputInteger("itemCount", itemCount);
	AppStateSetOutputDecimal("total", total);
	AppStateSetOutputBool("giftWrap", giftWrap);
	AppStateSetOutputJsonArray("lines", lines);
	AppStateSetOutputJsonObject("summary", summary);
	return("Order " + id + ": " + itemCount + " items, " + DecimalToString(total, "0.00"));
	// endregion
}
```

**`data/order.json`**
```json title="data/order.json"
{
  "id": "A-1001",
  "customer": {
    "name": "Ada Lovelace",
    "address": { "city": "London", "country": "UK" }
  },
  "items": [
    { "name": "Bamboo cup", "quantity": 2, "price": 12.5 },
    { "name": "Spare lid", "quantity": 1, "price": 3 },
    { "name": "Cleaning brush", "quantity": 3, "price": 1.99 }
  ],
  "giftWrap": true
}
```
<!-- /tabs -->

</details>

<!-- /project -->

## Break it on purpose

**Forget to assign a result back.** In `order-summary.mtc`, change the line that sets the city to:

```c
	JsonObjectSetString(summary, "city", city);
```

Deploy and run it again. The run still finishes, and nothing reports an error, but the city has gone from `summary`:

```text
Output "summary": {"order":"A-1001","customer":"Ada Lovelace","giftWrap":true,"total":33.97,"lines":["2 x Bamboo cup = 25.00","1 x Spare lid = 3.00","3 x Cleaning brush = 5.97"]}
```

`JsonObjectSetString` made a new object with the city in it, and the app threw it away. Every JSON call works this
way, which is why each one in the app is written `summary = …`. Put the `summary =` back.

**Send a list instead of an order.** Pass one as the argument:

<!-- tabs -->
```bash title="TypeScript"
node summary.ts '[{"id": "A-1001"}]'
```
```bash title="Python"
python summary.py '[{"id": "A-1001"}]'
```
```bash title="C#"
dotnet run summary.cs '[{"id": "A-1001"}]'
```
<!-- /tabs -->

The run ends with status `Error`, and its `failureDetails` say:

```text
StringToJsonObject failed: Value is not a JSON object, it is a Array
```

The app stopped at its first line, which named the system call that failed. The scripts raise that as an error
(`ProcessFailedError` in TypeScript and Python, `MaitentoProcessFailedException` in C#), as in
[tutorial 16](../16-apps.md#break-it-on-purpose). [Lesson 5](5-errors.md) catches errors like this one.

## If it didn't work

- **The deploy fails with `Argument count mismatch for DecimalToString (order-summary.mtc:…)`.** A system call takes
  every argument. Pass `""` for one you don't need, such as `DecimalToString(value, "")` for no format.
- **The run fails with `SysCall parameter obj resulted in null value, which is not permitted`.** The app read inside
  an object that isn't there, such as an order with no `customer`. A missing key reads as empty text: check it with
  `== ""` before reading inside it.
- **The run fails with `Variable :m0! is not a valid decimal`.** Arithmetic met text that isn't a number, such as
  `"quantity": "two"`. The name in the message is the app's own working name for the value.
- **The run fails with `The app stopped on an error it did not catch: Object reference not set to an instance of an
  object.`** A missing key went straight into a `bool`, which was then tested with `if`. Compare with `"true"`, as
  the app does.
- **A number in your object is in quotes.** It was set with `JsonObjectSetString`. Merge it in with
  `JsonAtaTransform`, or publish it as its own typed output.
- **`ENOENT` or "file not found" for `../data/order.json`.** Run the script from its language's folder.

## Review

You built:

- an app that reads an order sent as JSON, totals it and summarises it;
- a script that sends the order and reads back five outputs, each with its own type;
- a result object that holds text, true or false, a number and a list.

The concepts:

- [JSON values](../../concepts/cogniscript.md): a `jsonObject` or `jsonArray` holds JSON. An input arrives as text,
  so `StringToJsonObject` or `StringToJsonArray` turns it into one. `JsonObjectGet` reads one level at a time, and a
  missing key reads as `""`.
- Building JSON: every JSON call returns a new value, so assign it back. The Set calls store only text and true or
  false; `JsonAtaTransform` merges in the rest.
- [Typed named outputs](../../concepts/apps.md#what-an-app-produces): one `AppStateSetOutput…` call per type. Your
  code reads each by name, with its type beside it.

**Challenge:** total several orders at once. Write an app, `orders-total`, whose one input, `orders`, is a JSON list of
orders shaped like `data/order.json`. Print each order's total, and publish `orderCount` (an integer) and `grandTotal`
(a decimal). The solution is in
[`examples/cogniscript-04-json/solution`](../../../examples/cogniscript-04-json/solution/): an app and the orders it
totals.

**Next:** [5. When things go wrong](5-errors.md) checks an app's inputs, catches errors and carries on, and reads what
a failed run reports.
