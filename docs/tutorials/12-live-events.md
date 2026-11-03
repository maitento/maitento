---
title: 12. Live events
description: Hear about every change to your runs as it happens, over one WebSocket, with no public URL.
sidebar:
  order: 12
---

# 12. Live events

A webhook ([tutorial 11](11-webhooks.md)) needs a server that Maitento can reach on the internet. Live events work
the other way round: your code opens one WebSocket to Maitento, and every change to your runs comes down it the moment
it happens, including the reply as the model writes it. You'll follow one run live, watch all your runs at once, see
why you read a run back after subscribing, and see what happens when the connection drops. It's what a dashboard, a
command-line tool or a chat window needs: anything that's already running when the runs it cares about change.

> **You'll learn**
>
> - opening the live connection, and the events that come over it
> - following one run: its status changes, and its reply as it's written
> - why you read a run back after you subscribe, and after a reconnect
> - watching every run, your own or the whole tenant's
> - when to use live events and when to use a webhook
>
> **New concepts:** [live events](../concepts/runs-and-events.md#2-watch-it-live) ·
> **Builds on:** [4. Runs](04-runs.md) ·
> **Time:** about 20 minutes ·
> **Cost:** under $0.01 on DeepSeek ·
> **Needs:** two terminals, and a network that lets your code open a WebSocket to `api.maitento.com`

## 1. The project

A travel guide, and an interaction that asks it to describe a place in about 120 words:

<!-- snippet: examples/12-live-events/maitento/agents/guide.mtr -->
```hcl title="maitento/agents/guide.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a cheerful travel guide. You write warm, vivid descriptions in plain prose."
summary = "A travel guide"
```
<!-- /snippet -->

<!-- snippet: examples/12-live-events/maitento/interactions/one-shot/describe.mtr -->
```hcl title="maitento/interactions/one-shot/describe.mtr"
agent = {
  name = "Guide"
  agent = @ref("guide")
}
task = "Describe %%place%% for a first-time visitor in about 120 words."
inputs.prompts = [
  {
    name = "place"
    description = "A city, a town or a region"
    required = true
  }
]
```
<!-- /snippet -->

Run the scripts from `examples/12-live-events/typescript`, `python` or `csharp`, as in
[tutorial 1](01-hello-agent.md#run-it).

## 2. Follow one run live

`live.ts` opens the connection, starts a run without waiting for it (as in [tutorial 4](04-runs.md)), and then
listens for that run's events:

<!-- tabs -->
<!-- snippet: examples/12-live-events/typescript/live.ts -->
```ts title="TypeScript"
import { isTerminalStatus, Maitento, type InteractionProcess } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// One WebSocket to Maitento. Every change to your runs arrives over it.
const events = await mt.events.connect();

// Follow the run whose id you pass, or start a new one.
const id = process.argv[2] ?? (await mt.interactions.start("describe", { inputs: { place: "Lisbon" } })).id;
console.log(`Following run ${id}`);

// Say whenever the status changes, and finish once the run has ended. An event and a read-back can overtake each
// other, so anything older than the newest state already shown is ignored.
let latest: InteractionProcess | undefined;
let end!: (run: InteractionProcess) => void;
const ended = new Promise<InteractionProcess>((resolve) => (end = resolve));
const show = (run: InteractionProcess) => {
  if (latest && run.dateUpdated.getTime() < latest.dateUpdated.getTime()) return;
  if (run.status !== latest?.status) console.log(`\n[${run.status}]`);
  latest = run;
  if (isTerminalStatus(run.status)) end(run);
};

// The whole run, every time it changes.
events.on("interaction-process-updated", show, { id });

// The reply, a few words at a time, as the model writes it.
events.on("interaction-process-stream", (e) => {
  if (e.type === "Chat") process.stdout.write(e.stream);
}, { id });

// Events sent while the connection was down are lost, so read the run again when it comes back.
events.on("reconnected", async () => show(await mt.interactionRuns.get(id)));

// Events only tell you about changes from now on. The run may already have moved, or even ended: read it once now.
show(await mt.interactionRuns.get(id));

const run = await ended;
console.log(`Output: ${run.output?.length ?? 0} characters`);
await mt.close();
```
<!-- /snippet -->
<!-- snippet: examples/12-live-events/python/live.py -->
```python title="Python"
import sys
import threading
import time

from maitento import Event, Maitento
from maitento.models import InteractionProcess

FINAL = {"Finished", "Error", "Killed"}


class Follower:
    """Says whenever the run's status changes, and sets `ended` once the run has ended. Events (on the event thread)
    and read-backs (on this one) can overtake each other, so anything older than the newest state shown is ignored."""

    def __init__(self) -> None:
        self.latest: InteractionProcess | None = None
        self.ended = threading.Event()
        self.lock = threading.Lock()

    def show(self, run: InteractionProcess) -> None:
        with self.lock:
            if self.latest and run.date_updated < self.latest.date_updated:
                return
            if not self.latest or run.status != self.latest.status:
                print(f"\n[{run.status}]")
            self.latest = run
            if run.status in FINAL:
                self.ended.set()

    # The reply, a few words at a time, as the model writes it.
    def write(self, event: Event) -> None:
        if event.data.type == "Chat":
            print(event.data.stream, end="", flush=True)


mt = Maitento()
mt.deploy("../maitento")

# One WebSocket to Maitento. Every change to your runs arrives over it.
events = mt.events.connect()

# Follow the run whose id you pass, or start a new one.
run_id = sys.argv[1] if len(sys.argv) > 1 else mt.interactions.start("describe", inputs={"place": "Lisbon"}).id
print(f"Following run {run_id}")

follower = Follower()

# The whole run, every time it changes; and the reply as it's written.
events.on("interaction-process-updated", lambda event: follower.show(event.data), id=run_id)
events.on("interaction-process-stream", follower.write, id=run_id)

# Events sent while the connection was down are lost, so read the run again when it comes back.
events.on("reconnected", lambda event: follower.show(mt.interaction_runs.get(run_id)))

# Events only tell you about changes from now on. The run may already have moved, or even ended: read it once now.
follower.show(mt.interaction_runs.get(run_id))

# Wait until the run has ended. (A short sleep in a loop, so Ctrl+C works on every platform.)
while not follower.ended.is_set():
    time.sleep(0.2)

run = mt.interaction_runs.get(run_id)
print(f"Output: {len(run.output or '')} characters")
mt.close()
```
<!-- /snippet -->
<!-- snippet: examples/12-live-events/csharp/live.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Database;
using Maitento.Entities.Interactions;
using Maitento.Entities.MessageBus.UserNotifications;
using Maitento.Sdk;
using Maitento.Sdk.Notifications;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// One WebSocket to Maitento. Every change to your runs arrives over it.
await mt.Notifications.StartAsync();

// Follow the run whose id you pass, or start a new one.
var id = args.Length > 0
    ? Guid.Parse(args[0])
    : (await mt.InteractionProcesses.StartAsync(mt.DefaultNamespace!, "describe", [new NameValuePair("place", "Lisbon")])).Id;
Console.WriteLine($"Following run {id}");

var follower = new Follower();

// The whole run, every time it changes; and the reply, a few words at a time, as the model writes it.
mt.Notifications.Subscribe((INotificationClientHandlerInteractionProcessUpdated)follower, id);
mt.Notifications.Subscribe((INotificationClientHandlerInteractionStream)follower, id);

// Events sent while the connection was down are lost, so read the run again when it comes back.
mt.Notifications.Connected += async (_, _) => follower.Show((await mt.InteractionProcesses.GetInstanceAsync(id))!);

// Events only tell you about changes from now on. The run may already have moved, or even ended: read it once now.
follower.Show((await mt.InteractionProcesses.GetInstanceAsync(id))!);

var run = await follower.Ended.Task;
Console.WriteLine($"Output: {run.Output?.Length ?? 0} characters");

// Receives the run's events, in the order they arrived. The read-back above can overtake an event, so an update older
// than the one already shown is ignored.
class Follower : INotificationClientHandlerInteractionProcessUpdated, INotificationClientHandlerInteractionStream
{
    private readonly Lock gate = new();
    private InteractionProcess? latest;

    public TaskCompletionSource<InteractionProcess> Ended { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

    // Say whenever the status changes, and finish once the run has ended.
    public void Show(InteractionProcess run)
    {
        lock (gate)
        {
            if (latest is not null && run.DateUpdated < latest.DateUpdated) return;
            if (run.Status != latest?.Status) Console.WriteLine($"\n[{run.Status}]");
            latest = run;
            if (run.Status is InteractionProcessStatus.Finished or InteractionProcessStatus.Error or InteractionProcessStatus.Killed)
                Ended.TrySetResult(run);
        }
    }

    public Task OnInteractionProcessUpdated(InteractionProcess process, string messageHash)
    {
        Show(process);
        return Task.CompletedTask;
    }

    public Task OnInteractionStream(InteractionStreamUserNotification notification, string messageHash)
    {
        if (notification.Type == AiStreamingMessageType.Chat) Console.Write(notification.Stream);
        return Task.CompletedTask;
    }
}
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt interaction-start describe --input-place Lisbon
# Follows the run until it ends, printing its reply as it's written:
mt interaction-attach <run id> --stream
```
<!-- /tabs -->

```text
Following run 79a3a641-75b7-4918-81e6-e9f7c7f006d1

[New]

[Running]
Lisbon greets first-time visitors with a warmth that feels almost personal. Spread across seven hills above the Tagus River, the city rewards wandering: tiled facades in blues and yellows, laundry strung between wrought-iron balconies, and the melancholy sound of fado drifting from small taverns in Alfama. …
[Finished]
Output: 650 characters
```

**Done when:** the description appears a few words at a time between `[Running]` and `[Finished]`.

What's going on:

- **`events.connect()`** opens one WebSocket to Maitento (`mt.Notifications.StartAsync()` in C#). Every change to
  your runs comes over it, whichever of your scripts started them.
- **`on(name, handler, { id })`** calls the handler for one kind of event, here only for this run's id (Python:
  `id=`; C#: `Subscribe(handler, id)`). There's no subscribe request: Maitento sends you everything about your runs,
  and the SDK picks out what you asked for.
- **`interaction-process-updated`** carries the whole run every time it changes. A run is saved several times while
  it works, so the same status can arrive more than once: `live.ts` only prints a change.
- **`interaction-process-stream`** carries the reply a piece at a time. `type` is `Chat` for the reply's text, and
  `Function` when the model calls a tool.
- **Keep the newest.** An event and a read-back can overtake each other, so `live.ts` ignores anything older than the
  newest state it has shown, by `dateUpdated`, the same rule as for webhooks.
- **In Python**, `on()` handlers run on the SDK's own thread, so the main thread just waits for the end.

In C#, the SDK hands each run's events to your handlers in the order they arrived, one at a time, while different
runs' events are handled side by side. The `Follower` still keeps the newest update, because the read-back can
overtake an event, as in the other languages.

## 3. Break it on purpose: follow a run that has already finished

Run `live.ts` again with the id of the run you just followed. It doesn't start a new run; it follows that one:

```text
$ node live.ts 79a3a641-75b7-4918-81e6-e9f7c7f006d1
Following run 79a3a641-75b7-4918-81e6-e9f7c7f006d1

[Finished]
Output: 650 characters
```

Now put `//` (`#` in Python) in front of the line under "read it once now", and run that again. It prints
`Following run …` and then nothing, for ever. Press Ctrl+C, and put the line back.

**Done when:** with the line, the finished run is reported at once; without it, the script waits for ever.

Events only tell you what changes from now on, and a finished run never changes again. The same goes for anything
that happened between starting the run and subscribing to it. So the rule is: **subscribe first, then read the run
back once.** The `run()` helpers do exactly that.

## 4. Watch all your runs

`watch.ts` prints a line for every change to any of your runs, until you stop it:

<!-- tabs -->
<!-- snippet: examples/12-live-events/typescript/watch.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
const time = () => new Date().toTimeString().slice(0, 8);

// "user" (the default) carries your own runs, whole. "tenant" carries a short summary of every run in the tenant.
const scope = process.argv[2] === "tenant" ? "tenant" : "user";
const events = await mt.events.connect({ scope });
console.log(`Watching ${scope === "tenant" ? "every run in the tenant" : "your runs"}. Press Ctrl+C to stop.`);

// User scope: an interaction run changed. (Apps, capsules and code pipelines have events of their own.)
events.on("interaction-process-updated", (run) => console.log(`${time()}  ${run.id}  ${run.status}`));

// Tenant scope: any run of any kind changed.
events.on("process-updated", (run) => console.log(`${time()}  ${run.id}  ${run.status}  (${run.type})`));

// The SDK reconnects by itself. Anything that changed in between was missed, so read what matters again.
events.on("disconnected", () => console.log(`${time()}  Connection lost. Reconnecting…`));
events.on("reconnected", async () => {
  const active = await mt.runs.list({ state: "Active", namespace: mt.namespace });
  console.log(`${time()}  Reconnected. Runs still going: ${active.items.length}`);
  for (const run of active.items) console.log(`${time()}  ${run.id}  ${run.status}`);
});
```
<!-- /snippet -->
<!-- snippet: examples/12-live-events/python/watch.py -->
```python title="Python"
import sys
import time
from datetime import datetime

from maitento import Event, Maitento

mt = Maitento()


def now() -> str:
    return datetime.now().strftime("%H:%M:%S")


# "user" (the default) carries your own runs, whole. "tenant" carries a short summary of every run in the tenant.
tenant = sys.argv[1:] == ["tenant"]
events = mt.events.connect("tenant" if tenant else "user")
print(f"Watching {'every run in the tenant' if tenant else 'your runs'}. Press Ctrl+C to stop.")

# User scope: an interaction run changed. (Apps, capsules and code pipelines have events of their own.)
events.on("interaction-process-updated", lambda e: print(f"{now()}  {e.data.id}  {e.data.status}"))

# Tenant scope: any run of any kind changed.
events.on("process-updated", lambda e: print(f"{now()}  {e.data.id}  {e.data.status}  ({e.data.type})"))


# The SDK reconnects by itself. Anything that changed in between was missed, so read what matters again.
def reconnected(event: Event) -> None:
    active = mt.runs.list(state="Active", namespace=mt.namespace)
    print(f"{now()}  Reconnected. Runs still going: {len(active.items)}")
    for run in active.items:
        print(f"{now()}  {run.id}  {run.status}")


events.on("disconnected", lambda e: print(f"{now()}  Connection lost. Reconnecting…"))
events.on("reconnected", reconnected)

# The events arrive on another thread: this one just waits.
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    mt.close()
```
<!-- /snippet -->
<!-- snippet: examples/12-live-events/csharp/watch.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Interactions;
using Maitento.Entities.MessageBus.UserNotifications;
using Maitento.Entities.Processes;
using Maitento.Sdk;
using Maitento.Sdk.Notifications;

await using var mt = MaitentoClient.CreateFromEnvironment();

// User scope (the default) carries your own runs, whole. Tenant scope carries a short summary of every run in the tenant.
var tenant = args is ["tenant"];
await mt.Notifications.StartAsync(tenant ? NotificationScope.Tenant : NotificationScope.User);
Console.WriteLine($"Watching {(tenant ? "every run in the tenant" : "your runs")}. Press Ctrl+C to stop.");

var watcher = new Watcher();
mt.Notifications.Subscribe((INotificationClientHandlerInteractionProcessUpdated)watcher);
mt.Notifications.Subscribe((INotificationClientHandlerProcessUpdated)watcher);

// The SDK reconnects by itself, and raises Connected each time. Anything that changed in between was missed, so read
// what matters again.
mt.Notifications.Disconnected += (_, _) => Console.WriteLine($"{Watcher.Now}  Connection lost. Reconnecting…");
mt.Notifications.Connected += async (_, _) =>
{
    var active = await mt.Processes.ListAsync(new ProcessListRequest { State = "Active", Namespace = [mt.DefaultNamespace!] });
    Console.WriteLine($"{Watcher.Now}  Reconnected. Runs still going: {active.Items.Length}");
    foreach (var run in active.Items) Console.WriteLine($"{Watcher.Now}  {run.Id}  {run.Status}");
};

await Task.Delay(Timeout.Infinite);

class Watcher : INotificationClientHandlerInteractionProcessUpdated, INotificationClientHandlerProcessUpdated
{
    public static string Now => DateTime.Now.ToString("HH:mm:ss");

    // User scope: an interaction run changed. (Apps, capsules and code pipelines have events of their own.)
    public Task OnInteractionProcessUpdated(InteractionProcess run, string messageHash)
    {
        Console.WriteLine($"{Now}  {run.Id}  {run.Status}");
        return Task.CompletedTask;
    }

    // Tenant scope: any run of any kind changed.
    public Task OnProcessUpdated(ProcessUpdatedSummary run, string messageHash)
    {
        Console.WriteLine($"{Now}  {run.Id}  {run.Status}  ({run.Type})");
        return Task.CompletedTask;
    }
}
```
<!-- /snippet -->
```bash title="CLI"
# Every event about your runs, streamed text included. Ctrl+C stops it.
mt notifications
# Only interaction runs:
mt notifications interaction-process
```
<!-- /tabs -->

Start it in one terminal. In a second terminal, from the same language folder, run `live.ts` (or any earlier
tutorial's script). The first terminal shows the run as it goes:

```text
Watching your runs. Press Ctrl+C to stop.
23:12:03  30177aa9-2926-4cd1-8568-f690e17afcea  New
23:12:03  30177aa9-2926-4cd1-8568-f690e17afcea  Running
23:12:05  30177aa9-2926-4cd1-8568-f690e17afcea  Running
23:12:06  30177aa9-2926-4cd1-8568-f690e17afcea  Finished
```

**Done when:** each run you start in the second terminal appears in the first, ending `Finished`.

Events go to the user who started the run. With an API key that's the user who owns the key, so every script using
your key shows up here, and runs started by other people don't. Apps, capsules and code pipelines have events of
their own: `app-process-updated`, `capsule-process-updated` and `code-pipeline-process-updated`.

## 5. Your runs, or the whole tenant's

Run `watch.ts tenant` (`python watch.py tenant`, `dotnet run watch.cs tenant`). It connects with the **tenant**
scope, and sees every run in your tenant, of every kind, whoever started it:

```text
Watching every run in the tenant. Press Ctrl+C to stop.
19:19:07  54c93952-cc9e-4fd1-b418-9103abf3de3a  New  (Interaction)
19:19:07  54c93952-cc9e-4fd1-b418-9103abf3de3a  Running  (Interaction)
19:19:09  54c93952-cc9e-4fd1-b418-9103abf3de3a  Running  (Interaction)
19:19:09  54c93952-cc9e-4fd1-b418-9103abf3de3a  Finished  (Interaction)
19:19:14  2a647472-0387-44ed-b056-521918d3c3ab  Running  (App)
19:19:14  2a647472-0387-44ed-b056-521918d3c3ab  Finished  (App)
```

**Done when:** runs show up with their kind in brackets.

| | `user` scope (the default) | `tenant` scope |
|---|---|---|
| Which runs | the ones you started | every run in the tenant |
| Event | `interaction-process-updated` and the other per-kind events | `process-updated`, for every kind |
| What it carries | the whole run | a short summary: id, kind, status, `state`, dates, a one-line failure |
| Streamed reply | yes, for your runs | yes for your own runs, never for other people's |

A tenant-scope summary is a nudge: to see more of a run, read it with `runs.get()` or `interactionRuns.get()`. The
CLI's `mt notifications` uses the user scope only.

## 6. When the connection drops

The SDKs keep the connection alive (they send `ping` every 15 seconds; Maitento drops a connection it hasn't heard
from in 30), and reconnect by themselves when it drops. TypeScript and Python wait 1 second, then 2, 4 and so on up
to 30 between tries; C# tries every 2 seconds. They tell you with `disconnected` and `reconnected` events (in C#, the
`Disconnected` and `Connected` events).

**Events sent while the connection was down are lost.** Maitento doesn't replay them. So after a reconnect, read
again whatever you show: `live.ts` reads its run back, and `watch.ts` lists the runs still going. This is `watch.ts`
when its connection was cut while a run was working:

```text
23:12:11  f1f8016c-882c-496c-89d9-be91ab60ea74  New
23:12:11  f1f8016c-882c-496c-89d9-be91ab60ea74  Running
23:12:11  Connection lost. Reconnecting…
23:12:13  Reconnected. Runs still going: 1
23:12:13  f1f8016c-882c-496c-89d9-be91ab60ea74  Running
23:12:13  f1f8016c-882c-496c-89d9-be91ab60ea74  Finished
```

And `live.ts` when it was cut in the middle of the reply: the streamed text stops, the read-back after the reconnect
finds the run finished, and the run's `output` has the whole answer.

```text
[Running]
Lisbon greets first-time visitors with a warm, sunlit charm that rewards wandering. … Do not miss the custard tarts fresh from the oven in Belém, or
[Finished]
Output: 678 characters
```

Streamed text is for showing progress. The finished run is the record.

## 7. Live events or webhooks?

| | Live events | Webhooks ([tutorial 11](11-webhooks.md)) |
|---|---|---|
| Who connects | your code, to Maitento | Maitento, to your server |
| What you need | an outgoing WebSocket | a server with a public `https` address |
| While nothing is connected | changes are missed | deliveries are retried; a run's final state always arrives |
| The reply as it's written | yes | no |
| Good for | dashboards, CLIs, chat windows, scripts that are running anyway | backends that must hear about every run's end |

Many apps use both: a webhook so the backend never misses a run's end, and live events for the screen a person is
looking at.

## Without an SDK

The connection is `GET wss://api.maitento.com/notifications`, upgraded to a WebSocket, with your usual
`Authorization` header (`?scope=tenant` for the tenant scope; a browser, which can't set headers, passes a JWT as
`?authorization=<jwt>`). Each message is one JSON event, starting with `setup` once the connection is open:

```json
{"name": "setup", "id": -1160265096, "message": {}}
```

`name` is the event, `message` its payload (the whole run, for `interaction-process-updated`), and `id` a frame
number you can ignore. Send the text `ping` at least every 30 seconds, or Maitento closes the connection.

## If it didn't work

- **`ConnectionError: The event socket could not connect`, or it closed before it opened:** something between you
  and Maitento blocks WebSockets, often a company proxy or firewall. Allow `wss://api.maitento.com`, or use webhooks
  or polling ([tutorial 4](04-runs.md)) instead. In C#, `StartAsync` doesn't fail: it keeps trying, and no events
  arrive.
- **`No WebSocket implementation is available`:** Node.js 20 has no WebSocket built in. Use Node.js 22, as the
  tutorials do, or install the `ws` package and pass it: `new Maitento({ webSocket: WebSocket })`.
- **`watch.ts` shows nothing when someone else starts a run:** the user scope only carries your own runs. Use
  `watch.ts tenant`.
- **`live.ts` never ends:** the run is waiting for a person (`HumanInteractionRequired` or `PendingApproval`), which
  isn't a final status, or the read-back line is still commented out.
- **The run ends `Error` with `[api:model-keys:none-for-provider]`:** add a DeepSeek
  [model key](../concepts/models-and-keys.md), or change `model` in `guide.mtr`.

## Review

**What you built:**

- `live` follows one run: its status changes and its reply as it's written, reading the run back after subscribing
  and after a reconnect.
- `watch` prints every change to your runs, or to every run in the tenant, and catches up after a reconnect.

**The concepts:**

- [Live events](../concepts/runs-and-events.md#2-watch-it-live) come over one WebSocket that your code opens. They
  are best effort: nothing is replayed after a drop.
- Subscribe, then read back: events only tell you what changes from then on. Keep the newest state, by `dateUpdated`.
- The **user** scope carries your runs whole; the **tenant** scope a summary of every run.
- [Webhooks](11-webhooks.md) reach a server when nothing is connected; live events reach code that's already running.

**Challenge:** whenever one of your runs ends, print how long it worked and how many tokens it used. Hint: the
event carries the whole run, and `runs.get()` from tutorial 4 adds up its tokens. A solution in TypeScript, Python
and C# is in [`examples/12-live-events/solution`](../../examples/12-live-events/solution/):

```text
Waiting for your runs to end. Press Ctrl+C to stop.
39501722-e07a-405e-819c-7a9a0b9f1056  Finished after 2.3s, 134 tokens in and 150 out
```

All the files of this tutorial's project:

<!-- project: examples/12-live-events -->
**On GitHub:** [`examples/12-live-events`](https://github.com/maitento/maitento/tree/main/examples/12-live-events) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/12-live-events/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/12-live-events/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/12-live-events/csharp)

<details>
<summary>All the files in this project (2)</summary>

<!-- tabs: files -->
**`maitento/agents/guide.mtr`**
```hcl title="maitento/agents/guide.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a cheerful travel guide. You write warm, vivid descriptions in plain prose."
summary = "A travel guide"
```

**`maitento/interactions/one-shot/describe.mtr`**
```hcl title="maitento/interactions/one-shot/describe.mtr"
agent = {
  name = "Guide"
  agent = @ref("guide")
}
task = "Describe %%place%% for a first-time visitor in about 120 words."
inputs.prompts = [
  {
    name = "place"
    description = "A city, a town or a region"
    required = true
  }
]
```
<!-- /tabs -->

</details>

<!-- /project -->

**Next:** [13. Your documents](13-your-documents.md) answers from your own files.
