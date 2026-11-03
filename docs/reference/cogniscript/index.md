---
title: Cogniscript language
description: "The complete Cogniscript reference: programs and files, values and types, variables, operators, statements, functions, errors and limits."
sidebar:
  label: "Language"
  order: 110
---

# Cogniscript language

Cogniscript is the language of [apps](../../concepts/apps.md) and of
[code-pipeline hooks](../../concepts/code-pipelines.md#hooks-what-happens-next). This page is the whole language: every
rule a deploy checks, and what the code does when it runs. It is exact, so it is also blunt about the places where
Cogniscript does something you might not expect.

- New to Cogniscript? Start with [Cogniscript](../../concepts/cogniscript.md), then take
  [Learn Cogniscript](../../tutorials/cogniscript/index.md).
- The functions built into the language are the [system calls](system-calls/index.md).

Every example on this page is compiled, and the ones that show their output are run, by Maitento's own tests, so
what you read here is what Maitento does.

## A program

### Apps

An app is a folder under `apps/`, and the folder's name is the app's name. **Every `.mtc` file in the folder, and in
its sub-folders, is one program.** The files are compiled together, so a function in one file can call a function in
another, and the order of the files and of the functions in them doesn't matter.

```text
apps/
└── taglines/
    ├── taglines.mtc        main, and anything else
    ├── helpers.mtc         more functions, if you like
    └── taglines.mtr        optional settings, such as duration.max
```

An app starts at **`main`**. There must be exactly one, in any of the files. **`main`'s parameters are the app's
inputs**: `string main(string product, int count)` makes an app with two inputs, `product` and `count`. Each
parameter's type is published as the input's [`dataType`](../types/app-input.md), so whoever starts the app knows
what to send, but every input arrives as text and every input is required. What `main` returns is the run's
`returnValue`:

<!-- cogniscript: program -->
```c
string main(string product, int count) {
	PrintLine("Writing " + count + " taglines for " + product);
	return("done");
}
```
<!-- cogniscript: output product="a bamboo cup" count="3" -->
```text
Writing 3 taglines for a bamboo cup
```

| `main` ends with | The run's `returnValue` |
|---|---|
| `return(value)` or `exit(value)` | `value`, as text |
| `return;` | empty text |
| its closing `}`, without a `return` | `0` |

### Code-pipeline hooks

A pipeline's hooks are a folder under `code-pipeline-hooks/`, named after the pipeline. As with an app, every `.mtc`
file in it, sub-folders included, is one program. A hooks program has **no `main`**: when you deploy, Maitento writes
one, which calls the hook a phase or a step names. **Every function in the folder is a hook**, and so every function
must take the two parameters a hook is given:

<!-- cogniscript: hook -->
```c
string TestGate(string processId, string methodName) {
	PipelineLog(processId, "TestGate ran as " + methodName);
	return("{\"decision\": \"done\"}");
}
```

- `processId` is the id of the pipeline run, which the [hook system calls](system-calls/code-pipeline-hooks.md) take,
  such as [`PipelineLog`](system-calls/code-pipeline-hooks.md#pipelinelog). A hook is bound to that run: pass its
  `processId` on, because a hook call refuses any other run's id. `methodName` is the hook's own name.
- What the hook returns is its answer to the pipeline. For a phase's `postHook` that is a decision, as in
  [Hooks: what happens next](../../concepts/code-pipelines.md#hooks-what-happens-next). A `void` hook answers with
  empty text.
- **A function that takes anything other than those two parameters can't be in a hooks folder**, even as a helper
  that only other hooks call. The deploy fails: `Index was outside the bounds of the array.` for fewer parameters,
  `Argument count mismatch` for more, either one reported in `__main__.mtc`, the `main` Maitento wrote.
- A hooks folder can't have a `main` of its own: `Function main is already defined`.
- A hook has 30 seconds, unless the pipeline's `hookDurationLimit` or the run's own `hook` limit says otherwise.
  A hook that fails, or runs out of time, doesn't fail the pipeline run: the pipeline carries on as if it had
  answered `done`.

### Which system calls a program can use

| Program | System calls it can make |
|---|---|
| An app | the [standard library](system-calls/index.md#standard-library) and the [Maitento library](system-calls/index.md#maitento) |
| A code-pipeline hook | the [standard library](system-calls/index.md#standard-library) and the [hook calls](system-calls/index.md#code-pipeline-hooks) |

A hook can't use the Maitento library. One that calls it, such as `InteractionStart`, still deploys, because the
deploy checks hooks against both libraries, but it fails when it runs (`SysCall InteractionStart is not loaded`),
and the pipeline carries on as if it had answered `done`.

## Writing code

### Comments, spaces and lines

`//` starts a comment, which runs to the end of the line. There are no `/* */` comments. Spaces, tabs and line breaks
separate words and are otherwise ignored, so a statement can run over several lines. A statement ends with `;`,
unless it ends with a block, as an `if` does.

### Names

Functions, parameters and variables are named with letters and digits, and may start with `_` or a digit. **An underscore after
the first character is refused**, so write `retryCount`, never `retry_count`:

<!-- cogniscript: statements compile-error "Character '_' at index 6 is not valid for a keyword" -->
```c
int retry_count = 0;
```

Names are case-sensitive: `total` and `Total` are different names, and so are `if` and `If`.

These words are the language's own, and are written in lower case:

```text
if  else  for  while  break  continue  try  catch  return  exit  throw  true  false
string  int  decimal  bool  guid  date  jsonObject  jsonArray  void
```

### Numbers

A number is digits, with at most one decimal point: `42`, `19.99`, `.5`, `5.`. There is no exponent form (`1e3`), no hex
and no separators. A minus sign is the `-` operator, so `-3` is fine. A number keeps the decimal places it was written
with and loses leading zeros: `1.0` is `1.0`, and `007` is `7`.

### Text

Text is written in double quotes, never single quotes. It may run over several lines, and each line break in it is a
carriage return and a line feed.

A backslash starts an escape:

| Write | For |
|---|---|
| `\"` | a double quote |
| `\\` | a backslash |
| `\n`, `\r`, `\t` | a line feed, a carriage return, a tab |
| `\f`, `\v`, `\e` | a form feed, a vertical tab, an escape character |
| `\u00e9`, `\x41`, `\101` | the character with that code: hexadecimal after `\u` or `\x`, octal after a plain `\`; here `é`, `A` and `A` |
| `\` and a punctuation mark, such as `\.` or `\{` | the mark itself, so `"\."` is `.` |

A backslash before any other letter, such as `\d`, `\w` or `\s`, or before `8`, `9` or `_`, **fails the deploy**:
`Failure during assembler: Invalid pattern '\d' at offset 2. Unrecognized escape sequence \d.` The error names no
file or line, so search your code for the escape it quotes. So a regular expression needs every backslash doubled,
and so does a Windows path:

<!-- cogniscript: statements -->
```c
PrintLine(RegexIsMatch("2026", "^\\d{4}$"));
PrintLine("C:\\temp\\notes.txt");
PrintLine("She said \"hello\"");
```
<!-- cogniscript: output -->
```text
True
C:\temp\notes.txt
She said "hello"
```

`\b` and `\a` are escapes too (a backspace and a bell), so a regular expression's word boundary is `"\\b"`.

### Values with no literal

There is no `null`, no GUID literal and no literal for a JSON object or a list:

- `null` is read as the name of a variable, which doesn't exist, so the run stops. Use empty text, `""`, for "no value".
- Write an id as text: `guid runId = "6422bf07-1913-4e6c-8a42-391b49d42f11";`.
- Build JSON with the [JSON calls](system-calls/json.md), or read it from text with
  [`StringToJsonObject`](system-calls/conversion.md#stringtojsonobject) and
  [`StringToJsonArray`](system-calls/conversion.md#stringtojsonarray).

## Values and types

### The types

| Type | Holds | Written as text like |
|---|---|---|
| `string` | text | `Ada` |
| `int` | a whole number | `42` |
| `decimal` | a number with a decimal point | `19.99` |
| `bool` | true or false | `True` |
| `guid` | an id | `6422bf07-1913-4e6c-8a42-391b49d42f11` |
| `date` | a date and time | `11/02/2026 14:30:05` |
| `jsonObject` | a JSON object | `{"name":"Ada"}` |
| `jsonArray` | a JSON array | `["a","b"]` |
| `void` | nothing: the return type of a function that returns no value | |

### Every value is text

Underneath, every value is held as text. **A type on a declaration is a label for whoever reads the code. Maitento
doesn't convert the value to it, and doesn't check it**:

<!-- cogniscript: statements -->
```c
int half = 7 / 2;
int name = "Ada";
PrintLine(half);
PrintLine(name);
```
<!-- cogniscript: output -->
```text
3.5
Ada
```

The text is read as a type only where something needs that type, when the line runs:

| Where | Read as | When it can't be |
|---|---|---|
| arithmetic: `-` `*` `/` `%` | a number | the run stops: `Variable :m0! is not a valid decimal` |
| `+` | a number, if both sides are numbers | `+` joins the two texts instead |
| `<` `<=` `>` `>=` | a number | the run stops: `Variable :cmp0! is not a valid decimal` |
| `==` `!=` | nothing: the texts are compared exactly | |
| a condition: `if`, `while`, `for` | `true` or `false`, in any case | the run stops: `Variable :e0 is not a valid bool` |
| `&&` `\|\|` `!` | `true` or `false`, in any case | the run stops |
| a system call's argument | the parameter's type | the run stops: `Variable :a1:1! could not be parsed: Variable :a1:1! is not a valid integer` |

A name in an error that starts with a colon, such as `:m0!` or `:a1:1!`, is a value Cogniscript made while working
out an expression: `:m0!` is a side of some arithmetic, `:cmp0!` a side of a comparison, `:e0` the value being worked
on, and `:a1:1!` the second argument of a system call (they count from 0).

A system call's `int` parameter needs a whole number between about minus and plus two billion, `bool` needs `true` or
`false`, `guid` an id, `date` a date, and `jsonObject` and `jsonArray` text that parses as one. Most `jsonArray`
parameters take empty text as an empty list, `[]`.

### Empty values

Nothing is ever null. Where another language would give you null, Cogniscript gives you empty text: a JSON key that
isn't there, a JSON `null`, the value of a function that returns nothing. Check for it with `== ""` or
[`StringIsEmpty`](system-calls/strings.md#stringisempty).

Empty text isn't a number or a bool. In arithmetic other than `+`, in `<` and the other number comparisons, and as
a condition, it stops the run with
`Object reference not set to an instance of an object.`, and as a system call's number, bool, id or date it stops
the run with `SysCall parameter startIndex resulted in null value, which is not permitted` (naming the parameter).

### How values are written as text

- **Numbers keep their decimal places:** `1.5 * 2` is `3.0`, `1.50 + 1` is `2.50`, and `10 / 3` is
  `3.3333333333333333333333333333`. Round with [`MathRound`](system-calls/math.md#mathround), and format with
  [`DecimalToString`](system-calls/conversion.md#decimaltostring).
- **Booleans are `True` and `False`** when they come from `true`, `false`, a comparison or a system call, and `true`
  and `false` when they come from JSON or [`BoolToString`](system-calls/conversion.md#booltostring). Conditions accept
  either, but `==` compares the text, so `JsonObjectGet(person, "admin") == true` is `False` when `admin` is `true`.
  Use the value as a condition instead: `if (JsonObjectGet(person, "admin")) { ... }`.
- **JSON is JSON text.** The JSON calls write it compactly, as `{"name":"Ada"}`, and
  [`StringToJsonObject`](system-calls/conversion.md#stringtojsonobject) keeps the text you gave it.
  [`JsonObjectGet`](system-calls/json.md#jsonobjectget) gives a string value's own text, without its quotes, and any
  other value as JSON.
- **Dates** are month first, with no time zone: `11/02/2026 14:30:05`. See [Dates](system-calls/dates.md).

## Variables

A variable is declared with a type, a name and a value:

<!-- cogniscript: statements -->
```c
int count = 0;
string greeting = "Hello";
jsonObject order = JsonObjectCreate();
count = count + 1;
```

**The value is required.** A declaration without one fails the deploy:

<!-- cogniscript: statements compile-error "Could not parse all tokens in statement" -->
```c
int count;
```

**A variable lasts until the end of the block it was declared in**, the nearest `{ }`. A variable a `for` loop
declares belongs to the loop. Two blocks side by side may each declare the same name.

**A name can't be declared again while it's visible**, even in an inner block. There is no shadowing:

<!-- cogniscript: statements compile-error "Variable total already exists in this scope" -->
```c
int total = 1;
if (true) {
	int total = 2;
}
```

**A function sees only its own parameters and variables.** There are no global variables: nothing can be declared
outside a function.

Some mistakes are found only when the line runs, not when you deploy:

- **Reading a name that was never declared, or is no longer in scope**, deploys and then stops the run:
  `Variable missing does not exist`.
- **Assigning to a name that was never declared declares it**, without a type, until the end of the block. A typo in
  an assignment makes a new variable rather than an error.

Assignment is an expression whose value is the value assigned, so `a = b = 3;` sets both. Inside an `if`, `=` assigns
and `==` compares.

## Operators

From the first to bind to the last:

| Operators | | Groups |
|---|---|---|
| `f(...)` `x++` `x--` | calls, and increment and decrement after | left to right |
| `!x` `-x` `++x` `--x` | not, minus, and increment and decrement before | right to left |
| `*` `/` `%` | multiply, divide, remainder | left to right |
| `+` `-` | add or join, subtract | left to right |
| `<` `<=` `>` `>=` | compare numbers | left to right |
| `==` `!=` | compare text | left to right |
| `&&` | and | left to right |
| `\|\|` | or | left to right |
| `=` `+=` `-=` `*=` `/=` `%=` | assign | right to left |

Brackets change the order, as in `(1 + 2) * 3`.

### Arithmetic

**All arithmetic is decimal.** There is no whole-number division: `7 / 2` is `3.5` even when both sides are `int`.
Use [`MathFloor`](system-calls/math.md#mathfloor) or [`MathTruncate`](system-calls/math.md#mathtruncate) to drop the
fraction. `%` is the remainder and works on decimals too.

<!-- cogniscript: statements -->
```c
PrintLine(7 / 2);
PrintLine(7 % 2);
PrintLine(7.5 % 2);
PrintLine(1.5 * 2);
PrintLine(2 + 3 * 4);
```
<!-- cogniscript: output -->
```text
3.5
1
1.5
3.0
14
```

Dividing by zero stops the run with `Attempted to divide by zero.`, and a number too large for a decimal with
`Value was either too large or too small for a Decimal.`

### `+` adds or joins

**`+` adds when both sides read as numbers, and joins the two texts otherwise.** It decides each time it runs, from
the text it is given, not from the types you declared. Text reads as a number when it is digits with at most one
decimal point, and it may also have a sign, commas, and spaces before or after. So `+` adds more often than you
might expect:

<!-- cogniscript: statements -->
```c
PrintLine("Order " + 7);
PrintLine("10" + "20");
PrintLine("02139" + "0001");
PrintLine("Total: " + 2 + 3);
PrintLine(1 + ", " + 2);
```
<!-- cogniscript: output -->
```text
Order 7
30
2140
Total: 23
3
```

`+` works left to right, so `"Total: " + 2 + 3` joins twice. In `1 + ", " + 2`, `1 + ", "` gives `1, `, which reads as
a number, so adding `2` gives `3`. **To join texts that might look like numbers, such as ids, codes or a list you're
building, use [`StringConcatenate`](system-calls/strings.md#stringconcatenate)**, which always joins:

<!-- cogniscript: statements -->
```c
string list = "";
for (int i = 1; i <= 3; i++) {
	list = StringConcatenate(list, i);
}
PrintLine(list);
```
<!-- cogniscript: output -->
```text
123
```

With `list = list + i` the same loop prints `6`.

### Increment and decrement

`x++` and `x--` change a variable by one, and their value is the old value. `++x` and `--x` change it first, and
their value is the new one. They work through `+`, so on text that isn't a number they join: `"x"` becomes `x1`.

### Compound assignment

`x += y` is `x = x + y`, and `-=`, `*=`, `/=` and `%=` work the same way. So `+=` adds or joins just as `+` does:

<!-- cogniscript: statements -->
```c
int total = 10;
total += 5;
total *= 2;
PrintLine(total);
string tags = "#";
tags += "urgent";
PrintLine(tags);
```
<!-- cogniscript: output -->
```text
30
#urgent
```

### Comparisons

**`==` and `!=` compare text, exactly**, case included. Two numbers written differently are different:

<!-- cogniscript: statements -->
```c
PrintLine("Finished" == "finished");
PrintLine(1 == 1.0);
PrintLine(2.50 <= 2.5);
PrintLine("10" < "9");
```
<!-- cogniscript: output -->
```text
False
False
True
False
```

**`<`, `<=`, `>` and `>=` compare numbers**, even when the values are text, so `"10" < "9"` is false. Text that isn't
a number stops the run (`Variable :cmp0! is not a valid decimal`). Cogniscript has no way to put text in
alphabetical order. To compare text without caring about case, compare
[`StringToLower`](system-calls/strings.md#stringtolower) of each side.

A comparison's value is `True` or `False`. `1 < 2 < 3` doesn't chain: it compares `True` with `3`, and stops the run.

### And, or, not

`&&` is and, `||` is or, and `!` is not. Each side must read as `true` or `false`.

**`&&` and `||` stop as soon as they know the answer**, as in C: the right-hand side runs only when the left-hand side
hasn't decided it. `false && …` is `false` and `true || …` is `true` without the rest being worked out, so a check can
guard the call after it. Here the list is empty, so `JsonArrayGetAtIndex` never runs:

<!-- cogniscript: statements -->
```c
jsonArray items = JsonArrayCreate();
if (JsonArrayCount(items) > 0 && JsonArrayGetAtIndex(items, 0) == "urgent") {
	PrintLine("The first item is urgent");
}
PrintLine("Checked");
```
<!-- cogniscript: output -->
```text
Checked
```

`&&` binds tighter than `||`, so `a || b && c` is `a || (b && c)`. Use brackets when you mean otherwise.

## Statements

**The body of an `if`, `else`, `for`, `while`, `try` and `catch` is always a block in braces**, even when it is one
statement: `if (done) return("x");` fails the deploy.

### `if`, `else if`, `else`

<!-- cogniscript: functions -->
```c
string grade(int score) {
	if (score >= 90) {
		return("A");
	} else if (score >= 70) {
		return("B");
	} else {
		return("C");
	}
}
```

The condition goes in brackets and must read as `true` or `false`: `if ("yes")` stops the run with
`Variable :e0 is not a valid bool`. A JSON `true` from [`JsonObjectGet`](system-calls/json.md#jsonobjectget) or a
system call that returns `bool` works as a condition as it is.

### `while`

<!-- cogniscript: statements -->
```c
int left = 3;
while (left > 0) {
	PrintLine(left);
	left = left - 1;
}
```
<!-- cogniscript: output -->
```text
3
2
1
```

### `for`

`for (start; condition; step) { ... }`. The start may declare a variable, which belongs to the loop, or assign one
that already exists. Any part may be left out, as in C: `for (; i < 10; )` has no start and no step, and a loop with no
condition, such as `for (;;)`, goes round until a `break`, a `return` or an error ends it.

<!-- cogniscript: statements -->
```c
for (int i = 0; i < 3; i++) {
	PrintLine("Pass " + i);
}
```
<!-- cogniscript: output -->
```text
Pass 0
Pass 1
Pass 2
```

<!-- cogniscript: statements -->
```c
int tries = 0;
for (;;) {
	tries++;
	if (tries == 3) {
		break;
	}
}
PrintLine("Stopped after " + tries + " tries");
```
<!-- cogniscript: output -->
```text
Stopped after 3 tries
```

### `break` and `continue`

`break` leaves the innermost loop, and `continue` goes on to its next pass (in a `for`, the step runs first). Outside
a loop, either one fails the deploy: `Unable to break - not in for or while`.

<!-- cogniscript: statements -->
```c
int n = 0;
while (true) {
	n = n + 1;
	if (n == 2) {
		continue;
	}
	if (n > 4) {
		break;
	}
	PrintLine(n);
}
```
<!-- cogniscript: output -->
```text
1
3
4
```

### `return`, `exit` and `throw`

All three need brackets around their value: `return(x)`, never `return x`.

| Statement | What it does |
|---|---|
| `return(value)` | ends the function, giving `value` back to the caller. In `main` it ends the run, and `value` is its `returnValue`. One value only. |
| `return;` | ends a function that returns nothing. |
| `exit(value)` | ends the whole run at once, from any function, with `value` as its `returnValue`. The value is required. |
| `throw(message)` | stops with an error. A `try` can catch it. If nothing does, the run ends with status `Error` and `message` as its `failureDetails`. |

<!-- cogniscript: program -->
```c
void stopNow(string why) {
	exit("Stopped: " + why);
}

string main() {
	stopNow("nothing to do");
	return("never reached");
}
```
<!-- cogniscript: returns -->
```text
Stopped: nothing to do
```

### `try` and `catch`

`try { ... } catch { ... }` runs the `try` block, and if anything in it fails, carries on in the `catch` block.
Inside the `catch` block, [`GetLastError()`](system-calls/miscellaneous.md#getlasterror) is the error's message.

<!-- cogniscript: statements -->
```c
try {
	int amount = StringToInt("twelve");
	PrintLine("Got " + amount);
} catch {
	PrintLine("Not a number: " + GetLastError());
}
```
<!-- cogniscript: output -->
```text
Not a number: Cannot convert 'twelve' to integer
```

- **A `try` catches every error** in its block and in the functions it calls: a `throw`, a system call that failed,
  a value that isn't the type it needs, a missing variable, dividing by zero. It doesn't catch the run being stopped
  or reaching its time limit.
- There is always exactly one `catch`, with no brackets after it: no `catch (e)`, and no `finally`.
- What the `try` block declared is gone in the `catch` block.
- `GetLastError()` is empty text outside a `catch` block, and once the `catch` block has ended.
- **An error caught while a `catch` block is running breaks the run.** If a `try` inside a `catch` block, or in a
  function the `catch` block calls, catches an error, the run stops when the outer `catch` block ends, with
  `No error value to set variable ':ex' from`. Remember that the first attempt failed, and make the second attempt
  after its `catch` block:

<!-- cogniscript: statements -->
```c
bool failed = false;
try {
	throw("the first attempt failed");
} catch {
	failed = true;
	PrintLine(GetLastError());
}
if (failed) {
	try {
		throw("the second attempt failed too");
	} catch {
		PrintLine(GetLastError());
	}
}
```
<!-- cogniscript: output -->
```text
the first attempt failed
the second attempt failed too
```

### Expression statements

A call, an assignment or an increment on its own, such as `PrintLine("hi");` or `count++;`, is a statement. An empty
statement (`;` on its own) isn't.

## Functions

```text
returnType Name(type parameter, type parameter) {
	...
}
```

<!-- cogniscript: program -->
```c
int square(int n) {
	return(n * n);
}

void report(string label, int value) {
	PrintLine(label + ": " + value);
}

string main() {
	report("Nine squared", square(9));
	return("done");
}
```
<!-- cogniscript: output -->
```text
Nine squared: 81
```

- **A function's return type is any type, or `void`.** Its parameters each have a type and a name. There are no
  default values, so every call passes every argument.
- **Call a function before or after it is written, from any file of the program.** A function may call itself:
  calls can go about a thousand deep before the run stops with `Stack overflow`, which a `try` can catch.
- **Each name is used once.** There's no overloading (`Function greet is already defined`), and a function can't have
  the name of a system call the program can use (`Function StringLength redefines syscall`). In a hook, that
  includes the Maitento library's calls.
- **Arguments are copies.** Changing a parameter doesn't change the caller's variable.
- **A call must pass exactly the function's arguments.** Too few fails the deploy with
  `Argument count mismatch for report`, and too many with `Index was outside the bounds of the array.` The types of
  the arguments aren't checked.
- **A function with a return type must return a value on every path.** If it reaches its closing `}`, or runs a bare
  `return;`, the run stops with `No return value to set variable ':e0' from` as soon as it returns, even when the
  caller ignores the value. The value a function returns isn't checked against its return type.
- **Arguments are worked out left to right, before the call.** An argument can itself be a call, to a function of
  your own or a system call, as `square(9)` is above.
- **A `void` function's value is empty text.** A system call that returns nothing has no value at all: using one
  as a value gives whatever was worked out last, such as its own argument, so don't.

## System calls

A system call is a function built into Cogniscript. Call it by name, like a function of your own, and use its value
if it returns one:

<!-- cogniscript: statements -->
```c
string name = StringTrim("  Ada  ");
jsonObject person = JsonObjectCreate();
person = JsonObjectSetString(person, "name", name);
PrintLine(JsonObjectToString(person, false));
```
<!-- cogniscript: output -->
```text
{"name":"Ada"}
```

- **Pass every argument a system call takes**, even one you don't need. A call that leaves one out fails the deploy
  with `Argument count mismatch for InteractionStart`. Pass `""` for text you leave out and `"[]"` for a list.
- **The JSON calls return a new value**, so assign it back: `person = JsonObjectSetString(person, "name", name);`.
- **A system call that fails stops the run, unless a `try` catches it.** The run's `failureDetails` name the call,
  then say why: `StringToInt failed: Cannot convert 'abc' to integer`.
- Each argument is read as the type of its parameter, as in [Every value is text](#every-value-is-text).

What each call does, what it takes and what it returns is in [System calls](system-calls/index.md).

## Including files

### `@prompt` and `@json`

`@prompt("name")` is the text of the project's `prompts/name.md`, and `@json("name")` the text of its
`json/name.json`. They can stand anywhere a value can, in an app or a hook, and the file's text is put into the
program when you deploy:

<!-- cogniscript: statements -->
```c
string instructions = @prompt("house-style");
jsonObject schema = StringToJsonObject(@json("ideas"));
```

The file is found by its name alone, in any sub-folder of `prompts/` or `json/`. If there isn't one, the deploy fails:
`prompt file 'house-style' not found`. Inside a text value, `@prompt(...)` is just text.

### `@promptJson` and `@schemaJson`, in hooks

A hook usually returns JSON that holds a prompt, such as a step for the pipeline to add. `@promptJson(pipeline/name)`
puts `code-pipelines/<pipeline>/prompts/<name>.md` there, escaped so it can sit inside a JSON string inside a
Cogniscript text value. `@schemaJson(pipeline/name)` does the same for `code-pipelines/<pipeline>/<name>.schema.json`:

<!-- cogniscript: hook -->
```c
string AddFix(string processId, string methodName) {
	string step = "{\"name\": \"fix\", \"targetRole\": \"Fullstack\", \"prompt\": \"@promptJson(tested-change/fix)\"}";
	return("{\"decision\": \"inject\", \"injectPhases\": [{\"name\": \"fix\", \"steps\": [" + step + "]}]}");
}
```

- They are replaced when `mt`, an SDK or the portal reads the project, before anything is compiled, wherever they
  appear in the file, comments included.
- The pipeline is named explicitly, so a hook can use another pipeline's files. Both parts are plain names, with no
  `/`, `\` or `..`.
- If the file isn't there, the hook is left out of the deploy, and `mt` says why.
- They are for hooks only. In an app, `@promptJson(...)` is just text.

## When the code is checked

Your code is compiled when you validate a project (`mt build`, or **Validate** in the portal's **Build studio**) and
when you deploy it. A mistake stops the deploy, and nothing in the project is deployed. `mt` prints each error with
its file, line and character:

```text
<10:41:07.512> [ERR] (taglines.mtc Ln: 13 Chr: 25) Argument count mismatch for InteractionStart
```

The SDKs' `deploy` raises it as an error: `The build failed with 1 error(s). First: Argument count mismatch for
InteractionStart (taglines.mtc:13)`. A file in a sub-folder is named with its folder, such as `lib/text.mtc`.

One mistake can print several lines, such as `Could not parse statement` and then `Parsing failed`. Read the first.
Some errors name no file or line: `main() not found`, and an escape the language doesn't have.

| Error | Usually means |
|---|---|
| `Could not parse all tokens in statement` | a missing `;` (reported on the line after it), a declaration with no value, or a type name that doesn't exist |
| `Unrecognised statement` | a keyword in the wrong case, `try` without `catch`, or something that isn't a statement, such as `;` on its own |
| `Expecting BlockStart after if expression` | an `if` whose body isn't in braces |
| `Unknown call to name` | a function or system call that doesn't exist here, or is spelled with different capitals |
| `Argument count mismatch for name` | a call with too few arguments, or a hook function with more than two parameters |
| `Index was outside the bounds of the array.` | a call with too many arguments, or a hook function with fewer than two parameters |
| `Variable name already exists in this scope` | a name declared twice where both are visible |
| `Character '_' at index … is not valid for a keyword` | an underscore inside a name |
| `Invalid pattern … Unrecognized escape sequence` | a backslash before a letter in text: double it |
| `prompt file 'name' not found` | `@prompt` names a file the project doesn't have |

A deploy doesn't check types, that variables exist, or that functions return a value. Those mistakes stop the run
when the line runs, with the messages on this page.

## When the code runs

### When the run fails

An error that nothing catches ends the run with status `Error`, and its `failureDetails` say what happened:

| The run stopped on | Its `failureDetails` |
|---|---|
| `throw(message)` | `message`, exactly as you wrote it (an empty one becomes `The run stopped because of an unexpected error.`) |
| a system call that failed | `CallName failed:` and the reason |
| anything else | the error's message, such as `Variable missing does not exist`, or `The app stopped on an error it did not catch:` and the reason |

The SDKs' `run()` raises that as an error. See [What an app produces](../../concepts/apps.md#what-an-app-produces).

### Limits

| Limit | What happens |
|---|---|
| An app's `duration.max` (none unless you set one) | the run stops with status `Killed`: `App process exceeded its execution time limit and was terminated` |
| A hook's `hookDurationLimit` (30 seconds unless set) | the hook stops, and the pipeline carries on as if it had answered `done` |
| Someone stops the run | status `Killed`: `App process was cancelled` |
| Calls nested about a thousand deep | `Stack overflow` |

A `try` can't catch a time limit or a stop: the run ends between two steps of your code, and no `catch` block runs.
Time spent waiting for a run the app started counts towards its `duration.max`. There is no limit on loops, so a loop
that never ends runs until the time limit, or until it is stopped.

## Differences from C and JavaScript

If you know C, C#, Java or JavaScript, most of Cogniscript will look familiar. These are the places where it isn't:

- **Every value is text.** Types aren't checked or converted, and `int half = 7 / 2;` holds `3.5`.
- **`+` adds whenever both sides look like numbers**, text included: `"10" + "20"` is `30`. Join with
  `StringConcatenate`.
- **`&&` and `||` stop at the first side that decides the answer, as in C.**
- **`==` compares text exactly:** `1 == 1.0` is false, and `true` is written `True`.
- **`<` and `>` compare numbers only.**
- **No `null`, no `undefined`, no exception objects:** empty text stands for "no value", and an error is a message.
- **Braces are required** around every `if`, `else`, `for`, `while`, `try` and `catch` body.
- **`return`, `exit` and `throw` take brackets:** `return(x)`.
- **No `switch`, no `do … while`, no `catch (e)`, no `finally`, no `/* */` comments, no single
  quotes.**
- **No shadowing, no globals, no overloading, no default arguments.**
- **No underscores inside names.**
- **A variable must be given a value when it's declared**, but one you assign without declaring is made for you.
- **Integer division doesn't exist:** all arithmetic is decimal.
- **A backslash escape the language doesn't know fails the deploy**, so regular expressions need `\\`.
- **A function that should return a value and doesn't stops the run**, even when nothing uses the value.
