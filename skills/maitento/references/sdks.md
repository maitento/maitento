# The SDKs

Three SDKs with one shape: TypeScript (`@maitento/sdk`), Python (`maitento`) and C# (`Maitento.Sdk`). Each is a thin
layer over the HTTP API, so anything else can call the API directly (every call is in `docs/reference/api/`). The
shared contract is `sdks/DESIGN.md`; the TypeScript and Python sources are in `sdks/typescript/` and `sdks/python/`.

```bash
npm install @maitento/sdk        # Node.js 20+, Bun, Deno or a browser
pip install maitento             # Python 3.10+
dotnet add package Maitento.Sdk  # .NET 8+
```

## The client

```ts
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();                       // reads MAITENTO_API_KEY, MAITENTO_BASE_URL, MAITENTO_NAMESPACE
await mt.deploy("./maitento");                   // the project folder
const run = await mt.interactions.run("hello");  // start, wait, return the finished run
console.log(run.output);
```

```python
from maitento import Maitento

mt = Maitento()                     # AsyncMaitento has the same methods, awaited
mt.deploy("./maitento")
run = mt.interactions.run("hello")
print(run.output)
```

```csharp
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("./maitento", "my-namespace");
var run = await mt.Interactions.RunAsync("hello");
Console.WriteLine(run.Output);
```

- **The API key** is `"<user id>:<secret>"` in `MAITENTO_API_KEY`, or `apiKey` in the options. On the wire it's the
  header `Authorization: ApiKey <user id> <secret>`: the id is the **user's**, not the key's.
- **`namespace`** (or `MAITENTO_NAMESPACE`) is the default for calls by name; pass `{ namespace }` to override.
- **Spelling follows the language:** `interactionRuns.addMessage` in TypeScript is `interaction_runs.add_message` in
  Python and `InteractionProcesses.AddMessageAsync` in C#.

## What you'll call

| Job | TypeScript | Python |
|---|---|---|
| validate / deploy a folder | `mt.validate(folder)`, `mt.deploy(folder)` | `mt.validate(folder)`, `mt.deploy(folder)` |
| run an interaction and wait | `mt.interactions.run(name, { inputs })` | `mt.interactions.run(name, inputs={...})` |
| start without waiting | `mt.interactions.start(name, { inputs })` | `mt.interactions.start(name, inputs={...})` |
| read a run | `mt.interactionRuns.get(id)` | `mt.interaction_runs.get(id)` |
| talk to a chat | `mt.interactionRuns.addMessage(id, { message })` | `mt.interaction_runs.add_message(id, message=...)` |
| approve / reject a tool call | `mt.interactionRuns.approve(id, { approvalId })`, `.reject(id, { approvalId, reason })` | `mt.interaction_runs.approve(id, approval_id=...)`, `.reject(...)` |
| run an app | `mt.apps.run(name, { inputs })` | `mt.apps.run(name, inputs={...})` |
| run a code pipeline | `mt.pipelines.run(name, { inputs, repos })`, `mt.pipelineRuns.rawDiff(id)` | `mt.pipelines.run(...)`, `mt.pipeline_runs.raw_diff(id)` |
| secrets | `mt.secrets.create({ name, value })` | `mt.secrets.create(name=..., value=...)` |
| knowledge bases | `mt.partitions.create({ name })`, `mt.files.upload(id, path)`, `mt.files.search({ partitionId, query })` | same, snake_case |
| file systems | `mt.vfs.create({ name })`, `mt.vfs.open(name).writeText(path, text)` | `mt.vfs.open(name).write_text(...)` |
| webhooks | `mt.webhooks.create({ type, url, secret })` | `mt.webhooks.create(type=..., url=..., secret=...)` |
| live events | `mt.events.connect({ scope: "user" })` | `mt.events.connect(scope="user")` |

`get…` throws `NotFoundError` when something doesn't exist; `find…` returns `null` / `None` instead.

## `run()` helpers

`interactions.run`, `apps.run`, `capsules.run` and `pipelines.run` start the run (never retried), follow it over the
event socket or by polling, and return the run once it has ended. Options (TypeScript spelling):

- `onToken(text, agentName)`: the reply as it streams;
- `onUpdate(run)`: each new state;
- `onWaiting(run)`: the run needs a person (`HumanInteractionRequired`, `PendingApproval`). Each redrafted approval
  calls it again;
- `timeout`, `signal`: stop waiting. Neither kills the run unless you ask;
- `throwOnFailure: false`: return a failed run instead of throwing.

A run that ends `Error` or `Killed` throws `ProcessFailedError` (`MaitentoProcessFailedException` in C#) with its
`failureDetails`.

## Errors

Every SDK raises typed errors, all derived from `MaitentoError` (`MaitentoSdkException` in C#). Branch on the type and
the `code`, never on the message:

| Status | Error | Carries |
|---|---|---|
| 400 | `ValidationError` | `codes`, and `failures` each with `code`, `member`, `message` |
| 401 | `AuthenticationError` | |
| 403 | `PermissionError` | `code` |
| 404 | `NotFoundError` | |
| 429 | `RateLimitError` | `retryAfter` |
| other | `ApiError` | `status`, `code`, `body` |

Calls that start AI work (start, run, deploy, upload) are **never retried automatically**: a retried start would
create a second run. Reads and deletes are retried on network errors, 502, 503, 504 and 429.

## Knowing when a run is done

- the `run()` helpers;
- **live events** over one WebSocket (`events.connect`): `interaction-process-stream` for the reply as it's written,
  `interaction-process-updated`, `app-process-updated`, `code-pipeline-process-updated` and others. Delivery is best
  effort, so re-read the run after a reconnect;
- **webhooks**: Maitento calls your server whenever a run of a kind changes (`InteractionProcess`, `AppProcess`,
  `CapsuleProcess`, `CodePipelineProcess`, `IngestedFile`, `Billing`). A webhook hears about **every** run of its kind
  in the tenant, so filter. Check the `X-MT-WebHook-Signature` against the raw body before you parse it.

Concept page: `docs/concepts/runs-and-events.md`. Examples: `examples/04-runs/`, `examples/05-streaming/`,
`examples/11-webhooks/`, `examples/12-live-events/`.
