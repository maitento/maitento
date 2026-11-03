---
title: 17. On a schedule
description: Run the taglines app every morning with an automation, try it straight away, and see what every run did.
sidebar:
  order: 17
---

# 17. On a schedule

Have Maitento run tutorial 16's taglines app every morning at 07:00 UTC, with none of your code running. An
**automation** says what to start and when. Maitento's API calls it an *automated action*.

> **You'll learn**
>
> - how to say what an automation starts (an action) and when (a schedule, in UTC)
> - how to run it now, to test it, instead of waiting for the schedule
> - where to see what every run did, scheduled or not, and why one failed
>
> **New concepts:** [automations](../concepts/automations.md) · [cron schedules](../concepts/automations.md#schedules) ·
> the history
>
> **Builds on:** [16. Apps](16-apps.md) (this tutorial schedules its `taglines` app)
>
> **Time:** ~10 min · **Cost:** under $0.01 on DeepSeek per run, one run a day once it's scheduled · **Needs:**
> nothing beyond Get started

## 1. Schedule the app

An automation has two parts:

- **actions** say what to start. Here, one action starts the `taglines` app with its `product` input. An action
  names an app *version*, so the script looks up the latest one;
- **schedules** say when. A schedule is a cron expression in fields, and **its times are UTC**.

<!-- tabs -->
<!-- snippet: examples/17-on-a-schedule/typescript/schedule.ts -->
```ts title="TypeScript"
import { Maitento, type CreateAutomatedActionRequest } from "@maitento/sdk";

// This tutorial schedules the taglines app from tutorial 16, so deploy that project first.
const mt = new Maitento();
await mt.deploy("../../16-apps/maitento");

// An action says what to start: the latest version of the taglines app, with its input.
const app = await mt.apps.getByName("taglines");
const latest = Math.max(...app.versions.map((v) => v.version));
const request: CreateAutomatedActionRequest = {
  name: "daily-taglines",
  description: "Fresh taglines every morning",
  actions: [{
    name: "write-taglines",
    config: { $type: "app", version: { id: app.id, version: latest }, inputs: [{ name: "product", value: "a reusable bamboo coffee cup" }] },
  }],
};

// Create the automation, or point an existing one at the app's latest version.
const existing = await mt.automations.findByName("daily-taglines");
let automation = existing ? await mt.automations.update(existing.id, request) : await mt.automations.create(request);

// A schedule says when: here, every day at 07:00 UTC.
if (!automation.schedules.some((s) => s.name === "every-morning")) {
  automation = await mt.automations.addSchedule(automation.id, { name: "every-morning", minute: "0", hour: "7" });
}
// The automation's next run is the soonest of its schedules' next occurrences.
console.log(`${automation.name} runs taglines version ${latest}. Next run: ${automation.nextScheduledRunAt?.toISOString()}`);
```
<!-- /snippet -->
<!-- snippet: examples/17-on-a-schedule/python/schedule.py -->
```python title="Python"
from maitento import Maitento

# This tutorial schedules the taglines app from tutorial 16, so deploy that project first.
mt = Maitento()
mt.deploy("../../16-apps/maitento")

# An action says what to start: the latest version of the taglines app, with its input.
app = mt.apps.get_by_name("taglines")
latest = max(v.version for v in app.versions)
request = {
    "name": "daily-taglines",
    "description": "Fresh taglines every morning",
    "actions": [{
        "name": "write-taglines",
        "config": {
            "$type": "app",
            "version": {"id": app.id, "version": latest},
            "inputs": [{"name": "product", "value": "a reusable bamboo coffee cup"}],
        },
    }],
}

# Create the automation, or point an existing one at the app's latest version.
existing = mt.automations.find_by_name("daily-taglines")
automation = mt.automations.update(existing.id, request) if existing else mt.automations.create(request)

# A schedule says when: here, every day at 07:00 UTC.
if not any(s.name == "every-morning" for s in automation.schedules):
    automation = mt.automations.add_schedule(automation.id, name="every-morning", minute="0", hour="7")
# The automation's next run is the soonest of its schedules' next occurrences.
next_run = automation.next_scheduled_run_at.isoformat() if automation.next_scheduled_run_at else None
print(f"{automation.name} runs taglines version {latest}. Next run: {next_run}")
```
<!-- /snippet -->
<!-- snippet: examples/17-on-a-schedule/csharp/schedule.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Entities.AutomatedActions;
using Maitento.Entities.AutomatedActions.ProcessStartConfigs;
using Maitento.Entities.Core;
using Maitento.Entities.Database;
using Maitento.Sdk;

// This tutorial schedules the taglines app from tutorial 16, so deploy that project first.
await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../../16-apps/maitento");

// An action says what to start: the latest version of the taglines app, with its input.
var ns = mt.DefaultNamespace!;
var app = (await mt.Apps.GetByNameAsync(ns, "taglines"))!;
var latest = app.Versions.Max(v => v.Version);
AutomatedActionItem[] actions =
[
    new AutomatedActionItem
    {
        Name = "write-taglines",
        Config = new AppProcessStartConfig
        {
            Version = new VersionReference(app.Id, latest),
            Inputs = [new NameValuePair("product", "a reusable bamboo coffee cup")],
        },
    },
];

// Create the automation, or point an existing one at the app's latest version.
var existing = await mt.AutomatedActions.GetByNameAsync(ns, "daily-taglines");
var automation = existing != null
    ? await mt.AutomatedActions.UpdateAsync(existing.Id, "daily-taglines", "Fresh taglines every morning", actions)
    : await mt.AutomatedActions.CreateAsync(ns, "daily-taglines", "Fresh taglines every morning", actions);

// A schedule says when: here, every day at 07:00 UTC.
if (!automation.Schedules.Any(s => s.Name == "every-morning"))
{
    automation = await mt.AutomatedActions.AddScheduleAsync(automation.Id,
        new CronSchedule { Name = "every-morning", Minute = "0", Hour = "7" });
}
// The automation's next run is the soonest of its schedules' next occurrences.
Console.WriteLine($"{automation.Name} runs taglines version {latest}. Next run: {automation.NextScheduledRunAt:O}");
```
<!-- /snippet -->
```bash title="CLI"
mt app-get taglines                    # note the app's id and latest version
mt action-create daily-taglines --actions '[{"name":"write-taglines","config":{"$type":"app","version":{"id":"<app id>","version":2},"inputs":[{"name":"product","value":"a reusable bamboo coffee cup"}]}}]'
mt action-schedule-add -n daily-taglines -sn every-morning -m 0 -hr 7
```
<!-- /tabs -->

```text
daily-taglines runs taglines version 2. Next run: 2026-10-27T07:00:00.000Z
```

The script is safe to run again. It updates the existing automation, so the action always names the app's latest
version, and adds the schedule only once.

A schedule's fields are `minute`, `hour`, `dayOfMonth`, `month` and `dayOfWeek`, plus an optional `second`. A field
you leave out means "every":

| You want | Fields |
|---|---|
| Every day at 07:00 UTC | `minute: "0", hour: "7"` |
| Weekdays at 09:30 UTC | `minute: "30", hour: "9", dayOfWeek: "1-5"` |
| Every 15 minutes | `minute: "*/15"` |

In the portal, open **Automations**: `daily-taglines` is listed with its next run.

**Done when:** the script prints a next run at 07:00 UTC.

## 2. Run it now

Don't wait until tomorrow. Trigger it, and watch its history:

<!-- tabs -->
<!-- snippet: examples/17-on-a-schedule/typescript/trigger.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
const automation = await mt.automations.findByName("daily-taglines");
if (!automation) throw new Error("Run schedule.ts first.");

// Run it now, instead of waiting for the schedule.
const { processId } = await mt.automations.trigger(automation.id);

// Every execution goes in the automation's history, newest first. Wait until this one has finished.
let [entry] = await mt.automations.history(automation.id, { limit: 1 });
for (let attempt = 1; attempt < 60 && !(entry?.processId === processId && entry.dateCompleted); attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  [entry] = await mt.automations.history(automation.id, { limit: 1 });
}
console.log(`${entry.triggerType} run ${entry.processId}: ${entry.outcome}${entry.errorMessage ? ` (${entry.errorMessage})` : ""}`);

// The run itself is an ordinary app run.
if (entry.outcome === "Success") {
  const run = await mt.appRuns.get(processId);
  for (const line of run.consoleOutputs) console.log(line.text.trimEnd());
}
```
<!-- /snippet -->
<!-- snippet: examples/17-on-a-schedule/python/trigger.py -->
```python title="Python"
import sys
import time

from maitento import Maitento

mt = Maitento()
automation = mt.automations.find_by_name("daily-taglines")
if automation is None:
    sys.exit("Run schedule.py first.")

# Run it now, instead of waiting for the schedule.
process_id = mt.automations.trigger(automation.id).process_id

# Every execution goes in the automation's history, newest first. Wait until this one has finished.
entry = mt.automations.history(automation.id, limit=1)[0]
for attempt in range(1, 60):
    if entry.process_id == process_id and entry.date_completed:
        break
    time.sleep(2)
    entry = mt.automations.history(automation.id, limit=1)[0]
error = f" ({entry.error_message})" if entry.error_message else ""
print(f"{entry.trigger_type} run {entry.process_id}: {entry.outcome}{error}")

# The run itself is an ordinary app run.
if entry.outcome == "Success":
    run = mt.app_runs.get(process_id)
    for line in run.console_outputs:
        print(line.text.rstrip())
```
<!-- /snippet -->
<!-- snippet: examples/17-on-a-schedule/csharp/trigger.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Entities.AutomatedActions;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
var automation = await mt.AutomatedActions.GetByNameAsync(mt.DefaultNamespace!, "daily-taglines")
    ?? throw new InvalidOperationException("Run schedule.cs first.");

// Run it now, instead of waiting for the schedule.
var processId = await mt.AutomatedActions.TriggerAsync(automation.Id);

// Every execution goes in the automation's history, newest first. Wait until this one has finished.
var entry = (await mt.AutomatedActions.GetHistoryAsync(automation.Id, limit: 1))[0];
for (var attempt = 1; attempt < 60 && !(entry.ProcessId == processId && entry.DateCompleted != null); attempt++)
{
    await Task.Delay(2000);
    entry = (await mt.AutomatedActions.GetHistoryAsync(automation.Id, limit: 1))[0];
}
var error = entry.ErrorMessage != null ? $" ({entry.ErrorMessage})" : "";
Console.WriteLine($"{entry.TriggerType} run {entry.ProcessId}: {entry.Outcome}{error}");

// The run itself is an ordinary app run.
if (entry.Outcome == ExecutionOutcome.Success)
{
    var run = (await mt.Apps.GetProcessAsync(processId))!;
    foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
}
```
<!-- /snippet -->
```bash title="CLI"
mt action-trigger --name daily-taglines
mt action-history --name daily-taglines
```
<!-- /tabs -->

```text
Manual run 3c9c5e8a-f24a-44dd-89eb-aef2a803b114: Success
Brainstorming angles for a reusable bamboo coffee cup
- Bamboo by nature, crafted to last every day.
- Sip the change: one cup, endless refills, zero waste.
- Make it yours. Sip your ritual. Skip the waste.
```

A trigger starts the action straight away, as the schedule will. Every execution, by hand or by the schedule, is
recorded in the automation's **history**: what started it (`Manual` or `Schedule`), the run, and its outcome. That's
where to look for scheduled runs:

- **From code:** `automations.history`, newest first, or `mt action-history --name daily-taglines`.
- **In the portal:** **Automations** shows each automation's next and last run, and a **Failing** filter. Open
  `daily-taglines` for its **History**.
- **In Runs:** each execution is an ordinary app run, with its console, outputs and child runs.

Runs start as the person who created the automation, and use your tenant's model keys.

**Done when:** the history's newest entry is a `Manual` run with outcome `Success`, and you see three taglines.

## All the files

This tutorial has only scripts:

<!-- project: examples/17-on-a-schedule -->
**On GitHub:** [`examples/17-on-a-schedule`](https://github.com/maitento/maitento/tree/main/examples/17-on-a-schedule) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/17-on-a-schedule/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/17-on-a-schedule/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/17-on-a-schedule/csharp)
<!-- /project -->

The project it deploys is tutorial 16's:

<!-- project: examples/16-apps -->
**On GitHub:** [`examples/16-apps`](https://github.com/maitento/maitento/tree/main/examples/16-apps) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/16-apps/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/16-apps/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/16-apps/csharp)

<details>
<summary>All the files in this project (6)</summary>

<!-- tabs: files -->
**`maitento/agents/copywriter.mtr`**
```hcl title="maitento/agents/copywriter.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a sharp, playful marketing copywriter."
summary = "Writes marketing copy"
```

**`maitento/apps/taglines/taglines.mtc`**
```c title="maitento/apps/taglines/taglines.mtc"
// The taglines app: it asks for three campaign angles, then writes a tagline for each angle, all at once.
// An app starts at main. main's parameters are the app's inputs: this one has one, product.
string main(string product) {
	// Stop early, with a clear message, when the input is missing.
	if (product == "") {
		throw("Tell me which product to write taglines for.");
	}
	PrintLine("Brainstorming angles for " + product);

	// Start the brainstorm interaction and wait for it. The last three arguments are for memory,
	// model overrides and a response schema; this app uses none of them.
	jsonObject brainstormInputs = JsonObjectCreate();
	brainstormInputs = JsonObjectSetString(brainstormInputs, "product", product);
	guid brainstormId = InteractionStart("brainstorm", brainstormInputs, "[]", "[]", "");
	jsonObject brainstorm = InteractionAwait(brainstormId);
	if (JsonObjectGet(brainstorm, "status") != "Finished") {
		throw("The brainstorm failed: " + JsonObjectGet(brainstorm, "failureDetails"));
	}

	// The brainstorm's answer is JSON that matches json/ideas.json.
	jsonObject result = StringToJsonObject(JsonObjectGet(brainstorm, "output"));
	jsonArray ideas = JsonObjectGet(result, "ideas");

	// Start one tagline run per idea. They all run at the same time.
	jsonArray runIds = JsonArrayCreate();
	int ideaCount = JsonArrayCount(ideas);
	for (int i = 0; i < ideaCount; i++) {
		jsonObject inputs = JsonObjectCreate();
		inputs = JsonObjectSetString(inputs, "product", product);
		inputs = JsonObjectSetString(inputs, "idea", JsonArrayGetAtIndex(ideas, i));
		guid runId = InteractionStart("tagline", inputs, "[]", "[]", "");
		runIds = JsonArrayAdd(runIds, runId);
	}

	// Wait for every tagline run, then collect the answers.
	jsonArray runs = InteractionAwaitAll(runIds);
	jsonArray taglines = JsonArrayCreate();
	int runCount = JsonArrayCount(runs);
	for (int j = 0; j < runCount; j++) {
		jsonObject run = JsonArrayGetAtIndex(runs, j);
		if (JsonObjectGet(run, "status") == "Finished") {
			string tagline = JsonObjectGet(run, "output");
			PrintLine("- " + tagline);
			taglines = JsonArrayAdd(taglines, tagline);
		}
	}

	// A named output is what your code reads back from the finished run. return gives the run's return value.
	AppStateSetOutputJsonArray("taglines", taglines);
	return(JsonArrayCount(taglines) + " taglines");
}
```

**`maitento/apps/taglines/taglines.mtr`**
```hcl title="maitento/apps/taglines/taglines.mtr"
// Optional settings for the app. Stop it if it runs for more than five minutes.
duration.max = "00:05:00"
```

**`maitento/interactions/one-shot/brainstorm.mtr`**
```hcl title="maitento/interactions/one-shot/brainstorm.mtr"
agent = {
  name = "Copywriter"
  agent = @ref("copywriter")
}
task = "Suggest exactly three different campaign angles for this product: %%product%%"
inputs.prompts = [
  {
    name = "product"
    required = true
  }
]
schema.solution = @json("ideas")
```

**`maitento/interactions/one-shot/tagline.mtr`**
```hcl title="maitento/interactions/one-shot/tagline.mtr"
agent = {
  name = "Copywriter"
  agent = @ref("copywriter")
}
task = "Write one tagline of at most ten words for %%product%%, using this angle: %%idea%%. Reply with the tagline only."
inputs.prompts = [
  {
    name = "product"
    required = true
  },
  {
    name = "idea"
    required = true
  }
]
```

**`maitento/json/ideas.json`**
```json title="maitento/json/ideas.json"
{
  "type": "object",
  "properties": {
    "ideas": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Three short campaign angles"
    }
  },
  "required": ["ideas"],
  "additionalProperties": false
}
```
<!-- /tabs -->

</details>

<!-- /project -->

## Break it on purpose

In `schedule`, misspell the app's input: change `"product"` to `"prodcut"`. Run `schedule`:

```text
ValidationError: PUT /automated-actions/by-id/9b1f0c2e-4d7a-4c55-8f63-2a0de8c4a1b7 failed with 400 (api:automations:app-input-missing): App 'taglines' version 2 needs a value for every input, and this action gives none for: product
```

Every input an app declares is required, so Maitento checks an app action's inputs when you save the automation,
and refuses this one. Without that check, the mistake would only show at 07:00, when the scheduled run failed with
nobody watching. Python raises `ValidationError` too, and C# `MaitentoValidationException`, with the same code.

Some failures can only happen when a run starts, such as an app you deleted after creating the automation. Then
`trigger` fails with `api:automations:start-failed` and says why, and a scheduled run that can't start is in the
history as `Failed`, with the reason. After you change an automation, trigger it once and check its history.

Change `"prodcut"` back to `"product"`, and run `schedule` again.

## If it didn't work

- **It ran at the wrong time of day.** Schedules are in UTC, not your local time. Work out the UTC hour, and
  remember that daylight saving moves your local time, but not UTC.
- **A scheduled run uses an old version of the app.** An action names one app version, and keeps running it. After
  you change the app, run `schedule` again: it points the action at the latest version.
- **`trigger` fails with `api:automations:start-failed`.** The action couldn't start. The error says why, and so
  does its history entry.
- **Nothing ran at 07:00 UTC.** Check that the schedule is switched on (`isEnabled`, or its switch in the portal) and
  that the history shows no failure.

## Review

You built:

- an automation that runs the taglines app every morning at 07:00 UTC, always on its latest version;
- a script that runs it now and reads the result from its history;
- a broken input that Maitento refused when you saved the automation, not at 07:00.

The concepts:

- [Automation](../concepts/automations.md) (an automated action in the API): actions say what to start, an app,
  interaction, capsule or code pipeline at a given version with its inputs; schedules say when.
- [Cron schedule](../concepts/automations.md#schedules): fields such as `minute`, `hour` and `dayOfWeek`. Always UTC.
- Trigger and history: a trigger runs the actions now. The history records every execution, by hand or by schedule,
  with the run, its outcome and any error. Automations can also start when another run changes, with a
  [message trigger](../concepts/automations.md#triggers-on-other-runs).

**Challenge:** change the automation to run on weekdays only, at 09:30 UTC, instead of every day at 07:00. The
solution is in [`examples/17-on-a-schedule/solution`](../../examples/17-on-a-schedule/solution/). To go back to every
morning afterwards, remove the weekday schedule and run the tutorial's `schedule` script again.

**Next:** [18. Sub-interactions](18-sub-interactions.md) has an agent start other agents.
