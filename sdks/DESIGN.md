# Maitento SDK design (all languages)

This is the shared contract for the Maitento SDKs. The TypeScript (`@maitento/sdk`), Python (`maitento`) and any later
SDK follow it so that a tutorial reads the same in every language. Where a language has a strong idiom, the idiom
wins on spelling (camelCase vs snake_case, `async`/`await` shape) but never on structure.

## 1. Principles

1. **One obvious way.** Each operation has one method with one typed request object. There are no positional
   parameter lists longer than "what you are acting on" plus "the request".
2. **Short tutorials.** The common path must fit on a slide:
   ```ts
   const mt = new Maitento();                       // reads MAITENTO_API_KEY, MAITENTO_BASE_URL, MAITENTO_NAMESPACE
   await mt.deploy("./maitento");                   // the resource project folder
   const run = await mt.interactions.run("hello");  // start, wait, return the finished run
   console.log(run.output);
   ```
3. **Never surprise with money.** A call that starts AI work (start, run, deploy, ingest) is **never retried
   automatically**. A retried start would create a second run.
4. **Tolerant of the server growing.** Unknown JSON fields are kept or ignored, never an error. Unknown enum values
   come through as plain strings and never throw.
5. **Zero or minimal dependencies.** Use the platform HTTP client where one exists.

## 2. Client

| Option | Env var | Default |
|---|---|---|
| `apiKey`: the string `"<userId>:<secret>"` or `{ userId, secret }` | `MAITENTO_API_KEY` | - |
| `token`: a JWT, or a `tokenProvider` callback that returns one | - | - |
| `email` + `password` (JWT login, renewed proactively) | - | - |
| `baseUrl` | `MAITENTO_BASE_URL` | `https://api.maitento.com` |
| `namespace`: the default namespace for by-name calls | `MAITENTO_NAMESPACE` | none; required where used |
| `timeout` (per call, overridable per call) | - | 120 s |
| `maxRetries` (idempotent calls only: network errors, 502, 503, 504) | - | 2 |
| `maxRateLimitRetries` (idempotent calls only: a 429) | - | 6 |
| `fetch` / `httpClient` injection, `userAgent` suffix | - | - |

- On the wire an API key is the header `Authorization: ApiKey <userId> <secret>`. **`userId` is the id of the user that
  owns the key, not the key's id.** The `"<userId>:<secret>"` string form exists so one environment variable is
  enough; the portal shows it ready to copy.
- With a JWT, the SDK renews it with `GET /auth/renew` at 80% of its lifetime, or on the first call when less than
  5 minutes remain. It never waits for expiry.
- Python provides both `Maitento` (sync, httpx) and `AsyncMaitento` (async) with identical surfaces.

## 3. Resources and method names

Methods are grouped by resource. Spelling below is TypeScript; Python uses the snake_case equivalent
(`getByName` → `get_by_name`, `addMessage` → `add_message`).

| Group | Methods |
|---|---|
| `namespaces` | `list`, `get(name)`, `find(name)`, `create({name})`, `rename(id, {name})`, `delete(id)` |
| `models` (AI model catalogue) | `list()` |
| `modelKeys` (tenant model keys) | `list`, `create({provider, label, apiKey, baseUrl?, priority?})`, `update(id, {...})`, `delete(id)` |
| `credentials` (tenant model credentials) | `list({tag?})`, `get(id)`, `find(id)`, `create({name, provider, keys, models?, endpoint?, description?, tag?})`, `update(id, {...})` (every field replaced; keys matched by id), `delete(id)`, `deleteByTag(tag)` (returns how many), `test(id)`, `testUnsaved({...})` (before saving; stores nothing), `startSignIn(tool, {credentialId?}?)`, `finishSignIn(tool, {signInId, code?, name?, description?, tag?})` (keys are write-only: only `keyHint` is served) |
| `credentialStacks` | `list()`, `get(id)`, `find(id)`, `usage(id)` (defaults and knowledge bases using it), `create({name, description?, entries})`, `update(id, {...})`, `delete(id)`, `getTenantDefault()`, `setTenantDefault(credentialStackId \| null)`, `getNamespaceDefault(namespaceId)`, `setNamespaceDefault(namespaceId, credentialStackId \| null)` |
| `agents` | `list({namespace?})`, `get(id)`, `getByName(name, {namespace?})`, `find…` variants, `create(req)`, `update(id, req)`, `delete(id)` |
| `interactions` | `list`, `get`, `getByName`, `createOneShot`, `createRoundRobin`, `createManaged`, `update…`, `delete`, `start(name, req?)`, `run(name, req?, opts?)` |
| `interactionRuns` | `get(id)`, `transcript(run)`, `addMessage(id, {message})`, `addSystemMessage`, `approve(id, {approvalId})`, `reject(id, {approvalId, reason})`, `voteYes`, `voteNo`, `toolResult(id, sequence)`, `listActive({namespace?})` |
| `apps` / `appRuns` | `list`, `get`, `getByName`, `start(name, req?)`, `run(name, req?, opts?)`; runs: `get`, `updateInputs` |
| `capsules` / `capsuleRuns` | `list`, `get`, `getByName`, `start`, `run`; runs: `get`, `exec`, `execAndWait`, `getCommand`, `terminate` |
| `pipelines` / `pipelineRuns` | `list`, `get`, `getByName`, `start`, `run`; runs: `get`, `answer`, `diff`, `kill` |
| `runs` (any process type) | `list(query)` (paged), `get(id)`, `kill(id, {type})`, `lane(id, {type})` (waiting for a lane, and why), `summary`, `retain`, `release` |
| `connectors`, `tools` | `list`, `get`, `getByName`, `createOpenApi`, `delete`, `disableVersion`, `enableVersion` |
| `secrets` | `list`, `get`, `getByName`, `create({name, value})`, `update`, `delete` (values are write-only: no call reads one back) |
| `webhooks` | `list`, `create({type, url, secret, headers?})`, `update(id, {url, secret?, headers?, signedOnly?})` (`signedOnly: true` stops an older webhook sending its secret in `X-MT-WebHook-Secret`; one way), `delete`, `deliveries(id)` |
| `partitions`, `files` | `partitions.list/create/delete/files(id)`; `files.upload(partitionId, file)`, `get`, `text`, `search`, `delete` |
| `vfs` | `list`, `create`, `delete`, `open(name)` returns a handle with `readText`, `readBytes`, `writeText`, `writeBytes`, `append`, `list`, `exists`, `delete`, `mkdir` |
| `looms` | `list`, `get`, `threads`, `recall`, `seed`, `give`, `nightWeave` |
| `automations` | `list`, `get`, `create`, `update`, `delete`, `trigger(id)`, `history(id)` |
| `builds` | `validate(files)`, `deploy(files)`, `list` (paged), `get(id)` |
| `usage` | `summary`, `series`, `breakdown`, `runs` |
| `billing` | `standing()`, `plan()`, `balance()`, `catalogue()`, `notices({limit?})`, `autoTopUp()`, `setAutoTopUp({enabled, thresholdAmount, topUpAmount})`, `alerts()`, `setAlerts(settings)` (buying a plan or credit, and changing the plan, are the portal's) |
| `users` | `self()` |
| `tenant` | `retention()`, `setRetention({hours})` (up to the plan's maximum), `webAccess()`, `setWebAccess()`, `modelAccess()` |
| `events` | §6 |

Top-level shortcuts: `client.deploy(folderOrFiles, {namespace?})` and `client.validate(...)`. They read a resource
project folder (every `.mtr`, `.mtc`, `.md`, `.json` file below it, keeping relative paths) and call the Build API.

### get vs find

- `get…` throws `NotFoundError` on a 404 or an empty 204.
- `find…` returns `null` / `None` instead.

### Lists

- An unpaged server list returns an array.
- A cursor-paged list (`runs.list`, `builds.list`, `partitions.files`) returns a page object
  `{ items, nextCursor }` that is also **async-iterable over every item** (Python: iterable and async-iterable).

## 4. Models

- Response models are **generated** from the server's model assembly (`maitento/app/SdkModelGenerator`, which also
  writes `routes.json` and `models.json` here) and committed. Never hand-edit them: regenerate, and `--check` gates
  drift. They are read-only shapes. TypeScript uses `interface`s; Python uses pydantic v2 models with
  `extra="allow"`, snake_case attributes and camelCase aliases.
- Request models are separate, slim types. Response types contain write-only secrets as missing fields, so they
  must never be sent back.
- Wire formats the SDK converts for you:
  - **Dates:** ISO-8601 with up to 7 fractional digits, parsed to `Date` / `datetime` (truncated to microseconds).
  - **Durations:** .NET `TimeSpan` text (`"00:05:00"`, `"1.02:03:04.5"`). The SDK accepts and returns
    milliseconds in TypeScript and `timedelta` in Python. **ISO `PT5M` is never sent.**
  - **Polymorphic types:** the discriminator (`$type`, or `type` for pipeline credentials/repos) is written as the
    **first** JSON property.
  - **Enums:** PascalCase strings on the wire, typed as a string union plus `string` in TypeScript and a
    `str`-compatible enum in Python.
  - **Plain-text responses** (VFS text) are decided by `Content-Type`, not by guessing.

## 5. Errors

| Condition | Error | Carries |
|---|---|---|
| 400 with `validationFailures` | `ValidationError` | `failures[{code, member, message}]`, `codes` |
| 401 | `AuthenticationError` | - |
| 403 | `PermissionError` | `code?` |
| 404 / empty 204 on get | `NotFoundError` | - |
| 409 | `ConflictError` | - |
| 413 | `RequestTooLargeError` | `maxRequestBodyBytes` |
| 422 from file ingestion | `FileIngestionError` | `category`, `ocrAttempted`, `guidance` |
| 429 | `RateLimitError` | `retryAfter` |
| any other non-2xx | `ApiError` | `status`, `code?`, `body` |
| run ended `Error` / `Killed` inside a `run()` helper | `ProcessFailedError` | `run`, `failureDetails` |
| the capsule ended before a command `execAndWait` waits for finished | `CapsuleCommandAbortedError` | `command`, `runId`, `failureDetails` |
| network / timeout | `ConnectionError` / `TimeoutError` | cause |

All of these derive from `MaitentoError`. Code branches on the **error type and `code`**, never on message text.

**Retries:**
- Network errors and 502/503/504 are retried up to `maxRetries` times, with exponential backoff and jitter, honouring
  `Retry-After`.
- A 429 has its own budget, `maxRateLimitRetries`. The wait is `Retry-After` (or the body's `retryAfterSeconds`), else
  1 s doubling to 32 s, over a minute in all: an edge that rate-limits blocks for a minute and names no wait, and the
  quick retries above would all land inside the block.
- Both apply only to `GET`/`HEAD`/`DELETE`, plus calls marked idempotent in the SDK source: writing a VFS file,
  creating a VFS directory and the VFS tree, find and batch reads in all three SDKs, and in TypeScript and Python also
  the settings that are set rather than added to. C# sends its marked calls with `PutIdempotent`/`PostIdempotent`. An
  append is never one of them.

## 6. Live events

```ts
const events = await mt.events.connect({ scope: "user" });          // or "tenant"
events.on("interaction-process-stream", e => process.stdout.write(e.stream), { id: runId });
events.on("reconnected", () => resync());
for await (const e of events) { ... }                                 // alternative to on()
await events.close();
```

- One WebSocket: `GET /notifications`, upgraded.
  - Authentication goes in a header (`ApiKey` or `Bearer`) where the platform allows it.
  - A browser can only use a JWT, sent as `?authorization=<jwt>`.
- There is **no subscribe protocol**. The server pushes `{name, id, message}` frames and the SDK filters by event
  name and entity id.
- **Liveness:** the SDK sends `ping` every 15 s, because the server drops a client that is silent for 30 s.
- **Reconnect:** backoff from 1 s up to 30 s with ±20% jitter, using a fresh credential each time.
  - Delivery is at-most-once, so after reconnecting the SDK emits `reconnected`, and the `run()` helpers re-read
    their run.
- **Event names:**
  - `setup`
  - `interaction-process-updated`
  - `interaction-process-stream` (`{stream, sequence, associatedId, agentName, type: "Chat" | "Function"}`)
  - `app-process-updated`
  - `capsule-process-updated`
  - `code-pipeline-process-updated`
  - `ingested-file-updated`
  - `process-updated` (tenant scope only)

## 7. run() helpers

`interactions.run`, `apps.run`, `capsules.run` and `pipelines.run` work the same way:

1. They start the process. This is never retried.
2. They follow it, over the event socket when one is open and by polling `GET` otherwise (1 s growing to 5 s). Given
   an `onToken`, an interaction run opens the socket (user scope) before it starts when none is open, and closes it
   when the run ends; a socket the caller opened is used as it is and stays open. If it can't be opened, the run is
   followed by polling and a warning says no tokens will arrive.
3. They call `onToken(text, agentName)` for streamed chat deltas, `onUpdate(run)` for each new state, and
   `onWaiting(run)` when the run needs a person (`HumanInteractionRequired`, `PendingApproval`).
4. They resolve with the run in a terminal state. `Error` and `Killed` throw `ProcessFailedError` unless
   `{ throwOnFailure: false }`. Its message is the same in every SDK: `<Kind> run <id> ended <Status>: <failure
   details>`, or `... ended <Status>.` when the run recorded none (`Interaction`, `App`, `Capsule`, `Code pipeline`).
   A timeout reads `<Kind> run <id> did not finish within <seconds>s.`
5. They honour an abort signal or cancellation token and a `timeout`. Neither kills the run unless
   `{ killOnAbort: true }`.

### Waiting for one capsule command

`capsuleRuns.execAndWait(id, request, { timeout?, signal? })` (Python `exec_and_wait(id, command, arguments, ...,
timeout=, abort=)`, C# `CapsuleProcesses.RunCommandAndWaitAsync(id, request, options, ct)`) works like a `run()`
helper for one command:

1. It queues the command (`POST .../commands`). This is never retried.
2. It waits over the event socket when one is open (each `capsule-process-updated` event carries the run with its
   commands; the command is re-read after a reconnect and every 15 s), and otherwise polls the one command
   (`GET /capsule-processes/by-id/{id}/commands/{commandId}`), 0.25 s growing to 2 s.
3. It resolves with the command once it is `Finished` or `Error`. A non-zero exit code is a result, not an error.
4. A command still `Pending` or `Running` in a run that has ended reads as `AbortedOnTermination` (the server's read of
   one command says the same), and the helper throws `CapsuleCommandAbortedError`: `Capsule command <id> ended
   AbortedOnTermination: <failure details>`. A timeout reads `Capsule command <id> did not finish within <seconds>s.`
5. A timeout or an abort only stops the waiting: the command keeps running until its own `maximumDuration`.

## 8. Integration helpers (Maitento calling you)

- **Webhooks:**
  - `verifyWebhook(headers, body, secret, { toleranceSeconds?, now? })` (Python `verify_webhook(headers, body,
    secret, *, tolerance=300, now=None)`, C# `MaitentoWebhooks.Verify(header, body, secret, tolerance?, now?)`)
    checks `X-MT-WebHook-Signature` against the **raw** body: `v1=` and the lowercase hex HMAC-SHA256 of
    `"{X-MT-WebHook-Timestamp}." + body`, keyed with the secret's UTF-8 bytes. Any one of several comma-separated `v1=`
    values may match; every value is compared, in constant time. A timestamp more than the tolerance (default 5
    minutes) from now, either way, or a missing or malformed header, is `false`. An empty secret or an already-parsed
    body is an error. TypeScript's is async (Web Crypto). The plain `X-MT-WebHook-Secret` header that webhooks
    registered before signing still get is never accepted.
  - `signWebhook(secret, timestamp, body)` (`sign_webhook`, `MaitentoWebhooks.Signature`) returns the `v1=` value, so a
    receiver's tests can sign a delivery of their own. Every SDK tests the same vector: secret `whsec_test_secret`,
    timestamp `1793260000`, body `{"id":"abc","status":"Finished"}`, signature
    `v1=fcd362066648db6355d952ba1f00bf65504a4041eb38acae187a135015433cb6`.
  - `parseWebhook(headers, body)` returns `{ type, id, entity }` and checks nothing (Python's `parse_webhook(...,
    secret=)` verifies first when given the secret).
  - Deliveries are a `PUT` of the entity's latest state. They are at-least-once, so treat each one as "latest
    snapshot" and ignore anything older than the `dateUpdated` you already hold.
- **Tool callbacks:** the request body is the model's arguments, already validated against your connector's request
  schema. Your 2xx response body is the tool result. There is no SDK code on this path beyond types; the examples
  show a plain handler in each language.

## 9. Packaging

- **Version:** one shared version across NuGet, npm and PyPI, in the form `YY.M.N`.
- **Licence:** Apache-2.0. Homepage `https://docs.maitento.com`. Repository `https://github.com/maitento/maitento`.
- **TypeScript:**
  - ESM and CJS builds, with type declarations.
  - `sideEffects: false`.
  - Node ≥ 20, modern browsers and edge runtimes.
- **Python:**
  - Python ≥ 3.10.
  - `py.typed`.
  - Dependencies: `httpx`, `pydantic>=2`, `websockets`.
