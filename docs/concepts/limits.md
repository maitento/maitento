---
title: Limits
description: Time limits, tool-call limits, context-window handling and size limits, and how to set them.
sidebar:
  order: 18
---

# Limits

Every run needs brakes. These are the ones you control, and the fixed limits worth knowing.

## Time

| Where | Setting | What happens |
|---|---|---|
| Interaction | `duration.warn = "00:02:00"` | the agents are told time is running short |
| Interaction | `duration.max = "00:04:00"` | the run stops with `Error` ("Interaction timed out") |
| One run | `durationWarningOverride`, `durationAutoTerminationOverride` in the start request | overrides the two above for that run |
| App | `duration.max` in the app's `.mtr` | the app stops |
| Capsule | `maxDuration` (default 10 minutes), and per command `maxDuration` (default 300 seconds) | the capsule or command stops |
| Code pipeline | `durationAutoTermination`, and per-step limits | the step or run stops |

Durations are written `"hh:mm:ss"`, so five minutes is `"00:05:00"`. An interaction with no `duration.max` has no
time limit. Time spent waiting for a person doesn't count.

A run left waiting for a person's message for more than three days is closed as `Finished`. It isn't lost: a
message sent to it later opens it again where it left off.

See it in [tutorial 14](../tutorials/14-web-research.md), whose research run is warned at two minutes and stopped at
four. Child runs started as [sub-interactions](teams.md#sub-interactions) never run past the time their parent has
left.

## Tool calls

An agent in an interaction can make at most 10 rounds of tool calls per turn. After that its tools are withheld for
the rest of the turn, and it must answer with what it has. Change it with `context = { maxToolCallLoops = 20 }`, or
`0` for no limit.

## When the conversation gets too long

Long conversations and big tool results can outgrow a model's context window. `context` controls what Maitento
does about it:

| Setting | Values | Default |
|---|---|---|
| `mode` | `Automatic`, `Aggressive`, `None`, or `FailOnOverflow` | `Automatic` |
| `toolResultTrimming.mode` | `Never`, `OnOverflow`, `AfterCycles` or `Both`: replace old tool results with a placeholder or digest | `OnOverflow` |
| `compaction.type` | `None`, `SameAgent` or `StandaloneAgent`: summarise older parts of the conversation | `None` |
| `responseMaxTokens` | the most the model may write in one reply | 32,000 |

The defaults are the same however the interaction was made: deployed from a `.mtr` file with no `context` block, or
created through the API without `contextSettings`. `Automatic`, which shortens the oldest part of the conversation
when it no longer fits, is right for almost everything. Choose `FailOnOverflow` for a run that must end with an error
rather than lose part of its conversation.

## Teams

| Setting | Default | Maximum |
|---|---|---|
| Managed `limits.maxDispatches` | 30 | 200 |
| Round-robin `rules.noActionLoops.max` | no limit | |
| Sub-interactions `swarm.maxDepth` / `maxConcurrent` / `maxTotal` | 1 / 5 / 20 | 4 / 20 / 100 |

Team limits are **soft**: the run carries on. A manager that has used its dispatches is told so and finishes with
what it has, and an agent that can't start another sub-interaction is told why. Only time is **hard**: at
`duration.max` the run stops with `Error`. See them in
[tutorial 19](../tutorials/19-managed-teams.md#3-break-it-on-purpose-run-out-of-dispatches), which runs out of
dispatches on purpose, and [tutorial 18](../tutorials/18-sub-interactions.md).

## Your plan

What your plan includes, and how work is paid for, is in [Plans and billing](plans-and-billing.md). Your plan also
decides what you can start. A start it refuses answers `400` with one of these codes, and creates
nothing:

| Code | Why | What to do |
|---|---|---|
| `api:billing:premium-not-included` | Your plan doesn't include sandboxes (capsules) or code pipelines | upgrade |
| `api:billing:allowance-used` | on a plan without top-ups, this kind of work has used its allowance for the billing period | wait for the next period, or upgrade |
| `api:billing:out-of-credit` | your balance can't pay for more work, so nothing new starts anywhere in your tenant | top up, or upgrade |
| `api:billing:tenant-locked` | your tenant has been paused by Maitento, so nothing new starts until it's unlocked; work already running carries on | contact Maitento support |

Your allowance is used first, then your balance. A plan with top-ups runs past its allowance on its balance, and is
refused only when the balance is spent. The same applies to child runs: a run that starts another is refused in the
same way, and the refusal is what its start returns.

When your tenant runs out of credit, the work it already has going is stopped too: queued, running and waiting runs
end as `Killed`. On a plan without top-ups, only the work on the allowance that ran out is stopped.

Saving a file, or writing to a file system through the API, is checked the same way:

| Code | Why |
|---|---|
| `api:billing:storage-cap-reached` | the write would take you over your plan's storage, and your plan can't pay for more |
| `api:billing:out-of-credit` | you're out of credit, or over your storage with nothing in your balance to pay for it |

An agent's web search or fetch that your plan can't pay for comes back as a failed result with the error code
`out_of_credit`, `allowance_used` or `tenant_locked`, like any other web tool failure, so the agent can carry on without it.

Your plan also limits how many knowledge bases (temporary ones included) and file systems you can hold
(`api:partition:limit-reached`, `api:file-system:limit-reached`), as it does credentials and stacks. A lower limit
never deletes anything: it only stops you creating more until you're under it.

The [error-code reference](../reference/errors.md#plans-and-billing) lists every plan and billing code, including
the ones for buying and changing a plan.

### How many run at once

Your plan includes **lanes** for each kind of work: standard (interactions and apps together), sandboxes (capsules)
and code pipelines. A lane is room for one run at a time.

When all your lanes of one kind are in use, a new run isn't refused. It waits in status `New`, and starts as soon as
one of your runs of that kind finishes, or stops to wait for a person, an approval or the runs it started. Your runs
take their turn in the order you started them. A run that carries on after waiting (a reply, an approval, its child
runs finishing) takes a lane again, and waits for one like a new run.

A run started by an app doesn't wait for a lane. The app is still running while it waits for its child, so the child
would otherwise be waiting for the app. The child still uses a lane while it runs.

When the platform is busy, runs on higher plans start first, and tenants on the same plan take turns. Free work runs
when no paid work is waiting, with a share kept for it so it always moves.

A waiting run can be stopped like any other: it ends as `Killed` without starting.

A waiting run has `waitingForLaneSinceUtc` set, on the run and in run lists. To see why it's waiting, read its lane:

<!-- tabs -->
```ts
const runId = "b7e6d5c4-3a2b-4c1d-8e9f-0a1b2c3d4e5f";
const wait = await mt.runs.lane(runId, { type: "Interaction" });
if (wait.waiting) console.log(wait.reason, `${wait.lanesInUse} of ${wait.laneLimit ?? "unlimited"} in use`, `${wait.ahead} ahead`);
```
```python
run_id = "b7e6d5c4-3a2b-4c1d-8e9f-0a1b2c3d4e5f"
wait = mt.runs.lane(run_id, type="Interaction")
if wait.waiting:
    print(wait.reason, f"{wait.lanes_in_use} of {wait.lane_limit or 'unlimited'} in use", f"{wait.ahead} ahead")
```
```csharp
var runId = Guid.Parse("b7e6d5c4-3a2b-4c1d-8e9f-0a1b2c3d4e5f");
var wait = await mt.Processes.GetLaneAsync(ProcessType.Interaction, runId);
if (wait.Waiting)
    Console.WriteLine($"{wait.Reason}: {wait.LanesInUse} of {wait.LaneLimit?.ToString() ?? "unlimited"} in use, {wait.Ahead} ahead");
```
```bash
curl https://api.maitento.com/processes/Interaction/b7e6d5c4-3a2b-4c1d-8e9f-0a1b2c3d4e5f/lane -H "Authorization: $MAITENTO_AUTH"
```
<!-- /tabs -->

`reason` is `LanesInUse` when all your lanes of that kind are busy, or will be once your runs ahead of it start (one
of your runs has to free one, or you can add lanes). It's `PlatformBusy` when a lane of yours is free for it but the
platform has no room yet. `ahead` counts your runs of the same kind that started before it and are still waiting.

## Sizes

| What | Limit |
|---|---|
| A file uploaded to a knowledge base | 10 MB |
| One write to a file system | about 100 MB |
| An API request body | 30 MB |
| A tool response passed to the model | trimmed when very large |
| Web tools | 5 queries per search, 10 URLs per fetch, 25 MB per download, 300 web calls per run |
