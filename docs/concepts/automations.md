---
title: Automations
description: Start interactions, apps, capsules and code pipelines on a schedule, or when another run changes.
sidebar:
  order: 16
---

# Automations

An **automation** (Maitento's API calls it an *automated action*) says "when this happens, start that". The trigger
can be:

- a **schedule**, such as every weekday at 07:00;
- a **run changing**, such as when an interaction finishes with a certain answer.

What it starts can be an interaction, an app, a capsule or a code pipeline. It can also post a message into a
running interaction.

See it in [tutorial 17, On a schedule](../tutorials/17-on-a-schedule.md), which runs
[tutorial 16](../tutorials/16-apps.md)'s taglines app every morning, triggers it by hand, and reads its history.

## Create one

An automation has one or more **actions** (what to start) plus its triggers. This one starts the
[taglines app](apps.md) every morning:

<!-- tabs -->
```ts
const app = await mt.apps.getByName("taglines");
const daily = await mt.automations.create({
  name: "daily-taglines",
  actions: [{ name: "write-taglines", config: { $type: "app", version: { id: app.id, version: 1 },
                                              inputs: [{ name: "product", value: "a bamboo coffee cup" }] } }],
});
await mt.automations.addSchedule(daily.id, { name: "every-morning", minute: "0", hour: "7" });
```
```python
app = mt.apps.get_by_name("taglines")
daily = mt.automations.create(
    name="daily-taglines",
    actions=[{"name": "write-taglines", "config": {"$type": "app", "version": {"id": app.id, "version": 1},
                                                   "inputs": [{"name": "product", "value": "a bamboo coffee cup"}]}}],
)
mt.automations.add_schedule(daily.id, name="every-morning", minute="0", hour="7")
```
```csharp
var app = (await mt.Apps.GetByNameAsync(mt.DefaultNamespace!, "taglines"))!;
var daily = await mt.AutomatedActions.CreateAsync(mt.DefaultNamespace!, "daily-taglines", null,
[
    new AutomatedActionItem
    {
        Name = "write-taglines",
        Config = new AppProcessStartConfig
        {
            Version = new VersionReference(app.Id, 1),
            Inputs = [new NameValuePair("product", "a bamboo coffee cup")],
        },
    },
]);
await mt.AutomatedActions.AddScheduleAsync(daily.Id, new CronSchedule { Name = "every-morning", Minute = "0", Hour = "7" });
```
```bash
mt action-create daily-taglines --actions '[{"name":"write-taglines","config":{"$type":"app","version":{"id":"<app id>","version":1},"inputs":[{"name":"product","value":"a bamboo coffee cup"}]}}]'
mt action-schedule-add -n daily-taglines -sn every-morning -m 0 -hr 7
```
<!-- /tabs -->

Run it once now, to test it, with `trigger`:

<!-- tabs -->
```ts
const { processId } = await mt.automations.trigger(daily.id);
```
```python
process_id = mt.automations.trigger(daily.id).process_id
```
```csharp
var processId = await mt.AutomatedActions.TriggerAsync(daily.Id);
```
```bash
mt action-trigger --name daily-taglines
```
<!-- /tabs -->

Every run it starts is listed in its **history**, newest first: what started it (`Schedule`, `Message` or `Manual`),
the run's id, the outcome and, when it failed, why. Read it with `automations.history`, `mt action-history`, or the
automation's **History** in the portal. The history keeps the newest 50 entries.

When nothing could be started, `trigger` fails with `api:automations:start-failed` and says why, followed by the
cause's own code (`api:apps:input-missing` for an app started without one of its inputs, for example). It never
answers with an empty process id.

**An action pins a version.** An `app`, `interaction` or `capsule` action names the version it starts
(`version: { id, version }`), and keeps starting that version after you deploy a new one. Update the automation to
move it on: tutorial 17's script looks up the app's latest version each time it runs. A `codepipeline` action names
the pipeline instead, and an `interaction-message` action names the run it posts to.

## Schedules

A schedule is a cron expression split into fields: `minute`, `hour`, `dayOfMonth`, `month`, `dayOfWeek`, and an
optional `second`. Any field you leave out means "every". **Times are UTC.**

Each schedule's `nextOccurrence` says when it fires next, and the automation's `nextScheduledRunAt` is the soonest of
them. Both are up to date in the response to the call that adds, changes, removes or switches a schedule, and move on
after every scheduled run.

| You want | Fields |
|---|---|
| Every day at 07:00 UTC | `minute: "0", hour: "7"` |
| Weekdays at 09:30 UTC | `minute: "30", hour: "9", dayOfWeek: "1-5"` |
| Every 15 minutes | `minute: "*/15"` |

## Triggers on other runs

A **message trigger** starts the automation when a run changes and matches a filter. The filter is a JSONPath over
the change, for example "an interaction finished with priority P1":

```text
$..[?(@.item.interaction.id == '<interaction id>' && @.item.status == 5 && @.item.output =~ /"priority":"P1"/)]
```

## Good to know

- **An app action gives every input.** All of an app's inputs are required, so saving an action that leaves one out
  is refused with `api:automations:app-input-missing`, naming the input.
- **The `$type` must come first** in an action's `config`: `app`, `interaction`, `interaction-message`, `capsule` or
  `codepipeline`.
- **Runs start as the person who created the automation.** They pay for models like any other run: on the
  [credential stack](credentials.md#which-stack-a-run-uses) their definition, namespace or tenant names, or else on
  your [model keys](models-and-keys.md).
- **An action can choose the credential stack its runs use**: `credentialStack` (the stack's id or name) in an `app`
  or `interaction` action's `config`, or in a `codepipeline` action's `request`. Saving an action that names a stack
  you haven't got is refused with `api:credential-stacks:unknown`.
- **Filters see statuses as numbers.** For example, `5` is `Finished`.
- **A trigger with no filter fires on every change**, which includes the runs it starts itself. Always filter.
