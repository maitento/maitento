# Changelog

All notable changes to `@maitento/sdk`. Versions follow the shared Maitento SDK scheme `YY.M.N`.

## Unreleased

- A 429 has its own retry budget, `maxRateLimitRetries` (default 6, on the client and per call): an idempotent call
  waits out `Retry-After`, or without one 1 s doubling to 32 s, over a minute in all, so an edge's one-minute
  rate-limit block no longer fails it. Network errors and 502/503/504 keep `maxRetries`.
- A 429 that names no wait is no longer read as "retry after 0 s", which re-sent the call at once:
  `RateLimitError.retryAfter` is `undefined`.

## 26.11.1 (2026-11-04)

First release.

- `Maitento` client: API key, JWT (renewed proactively) or e-mail and password; `MAITENTO_API_KEY`,
  `MAITENTO_BASE_URL` and `MAITENTO_NAMESPACE`; per-call timeout and `AbortSignal`.
- Every public API route, grouped by resource, with typed requests and responses (dates as `Date`, durations in
  milliseconds).
- `deploy()` / `validate()` of a resource project folder (or in-memory files), with the `mt` CLI's layout. Deploying
  needs a tenant admin (`api:builds:deploy-requires-admin`); any member can validate.
- `run()` helpers for interactions, apps, capsules and code pipelines, over live events or polling. Given an
  `onToken`, `interactions.run` opens an event stream for the run when none is open (and closes it after), so the
  reply streams without connecting first.
- Live events over `/notifications`: keep-alive, reconnect with backoff, `reconnected`, user and tenant scope.
- Typed errors, retries for idempotent calls only, cursor paging, web-hook verification and parsing.
- A `run()` helper's errors word a run the same way in every Maitento SDK: `App run <id> ended Error: <failure
  details>` (`... ended Killed.` when the run recorded nothing), and `Interaction run <id> did not finish within 2s.`
- `automations.trigger()` throws a `ValidationError` with code `api:automations:start-failed` (followed by the
  cause's own codes) when no action could start, instead of returning an empty process id. Creating or updating an
  automation whose app action leaves out one of the app's inputs is refused with `api:automations:app-input-missing`.
- Usage: `toolCalls` (on `/usage/runs` rows and the usage totals) counts an interaction run's tool calls too; it was 0
  for every interaction run.
- `credentials` and `credentialStacks`: the tenant's own access to model providers. A credential is a provider, its
  API keys, the models it may serve, an optional endpoint and tag, and its health (a circuit breaker): `list({ tag? })`,
  `get` / `find`, `create`, `update`, `delete`, `deleteByTag(tag)` (returns how many) and `test(id)` (rate-limited per
  tenant). Keys are write-only: only `keyHint` is served, and an update keeps a key sent as `{ id }` without its value,
  or with the value it already has.
  `startSignIn(tool)` and `finishSignIn(tool, { signInId, code? })` sign a Claude Code or Codex subscription in as an
  OAuth credential; Codex's finish is polled until it returns `Complete`. A credential stack is an ordered list of
  credentials with per-entry rules (`list`, `get` / `find`, `create`, `update`, `delete`), and
  `getTenantDefault` / `setTenantDefault(id | null)` and `getNamespaceDefault` / `setNamespaceDefault(namespaceId, id |
  null)` read and set the stack runs fall back to.
- Starting an interaction, an app or a code pipeline takes `credentialStack` (the stack's id or name) to run on that
  credential stack: its credentials serve the run, and Maitento's own keys never do. An app's stack is the stack of
  every run it starts. Naming a stack and passing `credentials` at once is refused with
  `api:credential-stacks:with-credentials`; naming one the tenant hasn't got, with `api:credential-stacks:unknown`.
- Interactions, apps and code pipelines can name their own credential stack (`credentialStack` on their versions and
  on the interaction update and pipeline create requests; `credentialStack` in an `.mtr` file or `pipeline-definition.json`):
  runs that don't name one at the start use it before the namespace's and the tenant's default.
- An Anthropic credential can reach Claude on Amazon Bedrock or Google Vertex AI: `cloud: { kind: "Bedrock", awsRegion }`
  or `{ kind: "Vertex", gcpProjectId, gcpRegion }` (endpoint kinds `Bedrock` and `Vertex`), with the Bedrock API key or
  the service account's JSON key file as its key. Only code pipelines' Claude Code agents run on it; testing it answers
  `api:credentials:test-not-supported`; a cloud that can't be reached is refused with `api:credentials:cloud-invalid`.
- On a credential stack, a model an agent override defines inline (`customModel`) and a coding agent on your own
  endpoint (`CustomAnthropic`, `CustomOpenAiResponses`, `CustomOpenAiChat`) run on the stack's credentials that have
  their own endpoint, for the model's API, and name the model in `models`; they had no credential on a stack before.
- `credentialStacks.findByName(name)` (`GET /credential-stacks/by-name/{name}`): a stack by its name, or `null`.
- `credentials.testUnsaved(request)` (`POST /credentials/test`): tests a credential before saving it, with what
  `create` takes, and stores nothing.
- `credentialStacks.usage(id)` (`GET /credential-stacks/by-id/{id}/usage`): whether a stack is the tenant's default,
  the namespaces whose default it is, and the knowledge bases that embed with it.
- `credentials.importSignIn({ tool, accessToken, refreshToken, expiresAtUtc, idToken? })` makes an OAuth credential
  from a sign-in whose tokens you already hold, and `replaceSignInTokens(id, tokens)` swaps them after you refresh:
  Maitento never refreshes such a sign-in itself (`oauth.refreshedByCaller`). Each route refuses the other kind of
  sign-in (`api:credentials:sign-in-refreshed-here`, `api:credentials:sign-in-refreshed-by-caller`).
- An automation's `app` and `interaction` actions take `credentialStack` (the stack's id or name) for the runs they
  start, as a `codepipeline` action's `request` does. Saving an action that names a stack the tenant hasn't got is
  refused with `api:credential-stacks:unknown`; a pipeline action with a stack and `credentials` of its own, with
  `api:credential-stacks:with-credentials`.
- `partitions.setEmbeddingCredentialStack(id, stackId | null)`: a knowledge base embeds on its own credential stack
  (`embeddingCredentialStackId` on `Partition`), after its own embedding keys and in place of the tenant's model keys
  and default stack, never on Maitento's key. Deleting a stack a knowledge base embeds with is refused with
  `api:credential-stacks:in-use-by-partition`.
- A `NotFoundError` from starting a run by name, or from naming a namespace that does not exist, says what was not
  found (`Interaction 'brainstorm' was not found in namespace 'demo'.`): the 404 now carries it as `{ error }`.
- Stable error codes for a refused interaction start (`api:interactions:input-required`, `input-empty`,
  `input-invalid`, `input-unknown`, `not-found`, `no-enabled-version`, `response-schema-invalid`,
  `swarm-limits-invalid`, `loom-*`, `ai-model-override-invalid`), for deleting a knowledge base that still holds files
  (`api:partition:not-empty`), and for refused embedding credentials. They used to be derived from the request member
  (`request`, `id`, `credentials`). The messages name the interaction rather than its id.
- A required tool-binding or auth input with a default no longer refuses a run that leaves it out: the run uses the
  default (shown in the run's inputs), as it does when the input is passed empty.
- An interaction created through the API without `contextSettings` gets the same context defaults as one deployed
  from a `.mtr` file with no `context` block (`Automatic` trimming, a 32,000-token reply cap); it used to get
  `FailOnOverflow` and the model's full reply.
- Files: `IngestedFile.indexingFailure` (and on file listings): why a file can't be indexed until someone acts, as a
  `code` (`api:embeddings:fallback-not-permitted` when there is no embedding key, `api:embeddings:credentials-exhausted`
  when every key failed), a `message` and `dateFailed`. Cleared once the file is indexed. Searching a knowledge base
  that can't embed is refused with `api:embeddings:fallback-not-permitted` instead of returning no results.
- Files of a knowledge base with no embedding key it may use wait instead of being retried every few minutes, and start
  again once a key, a credential stack or consent to Maitento's key is added. Such a knowledge base carries one
  `PartitionEmbeddingCredentialFailure` with `failureReason` `IndexingDisabled` and `credentialId` `maitento-fallback`
  (listed by `GET /partitions/embedding-credential-failures`), so you can tell your admins.
- `capsuleRuns.execAndWait(id, request, { timeout?, signal? })` queues a command and waits for it to end, over live
  events when a stream is open and by polling the one command otherwise; it resolves with the command's exit code and
  output, and rejects with the new `CapsuleCommandAbortedError` when the capsule ends first. `capsuleRuns.getCommand(id,
  commandId)` reads one command (`GET /capsule-processes/by-id/{id}/commands/{commandId}`).
- Secrets are write-only: `secrets.value(name)` and its route, `GET /secrets/by-name/{name}/value`, are removed, so
  nothing reads a stored value back. Replace a value with `secrets.update` instead.
- Code pipeline repositories take `isReadOnly`: a read-only repository is cloned as context for the agents, but a run
  never commits, pushes or diffs it. It defaults to `false`.
- `tenant.setRetention({ hours })`: a tenant admin sets how long finished runs are kept, up to the plan's maximum (the
  new `planMaxHours` in `tenant.retention()`); `hours: null` goes back to the platform default. A retained run is kept
  for at most the plan's maximum, and its retention status says when that is (`leaseEndsAtUtc`).
- `runs.lane(id, { type })`: whether a run is waiting for a lane before it starts, since when, why (`LanesInUse` or
  `PlatformBusy`), and how many of your runs are ahead of it. Runs and run lists carry `waitingForLaneSinceUtc`.
- `billing`: the tenant's plan and billing. `standing()` (the plan and its state, the balance, whether work can start,
  any plan change on its way, and this month's use of each allowance), `plan()`, `balance()`, `catalogue()` (the
  plans on sale), `notices({ limit })`, and the balance settings: `autoTopUp()` / `setAutoTopUp()` and `alerts()` /
  `setAlerts()`. Buying a plan or credit, and changing the plan, stay in the portal. The standing also says when the
  balance is low (`lowBalance`, by the alert settings) and when the subscription renews (`termEndsAtUtc`).
- `TenantRegisterRequest`: `code` is optional, and there's a new `turnstileToken`. Where sign-up is open, a tenant can be
  registered without an invitation code, with the sign-up page's Cloudflare Turnstile token instead.
- Sign-in with GitHub, Google and Microsoft is a portal flow under `/auth/sso`, which the SDK doesn't wrap (an SDK
  client has no browser to send to a provider). Its request and response types are exported: `SsoProvider`,
  `SsoProvidersResponse` (with `signUpOpen` and the `startBaseUrl` a sign-in starts from), `SsoExchangeRequest` and
  `SsoConfirmLinkRequest`.
- A `Billing` webhook type: a `BillingNotice` is delivered when your tenant runs out of credit or gets it back
  (`OutOfCredit`, `CreditRestored`), uses up an allowance (`AllowanceUsed`), runs low (`LowBalance`), its plan changes
  (`PlanChanged`, `PlanRestored`, `MovedToFree`), a renewal payment fails (`PaymentFailed`, then `FreezeReminder` and
  `FreezeEnded`), or an automatic top-up can't be charged (`AutoTopUpFailed`). It carries the `meter`, `balance`,
  `currency`, `tier`, `previousTier` and `frozenUntilUtc` where they apply.
- Web-hook deliveries are signed. `verifyWebhook(headers, body, secret, { toleranceSeconds?, now? })` now checks
  `X-MT-WebHook-Signature` (`v1=` and the HMAC-SHA256 of `"{timestamp}." + body`, keyed with your secret) against the
  **raw** body, and refuses a delivery whose `X-MT-WebHook-Timestamp` is more than 5 minutes from now, so a delivery
  can't be forged by someone who saw another, or replayed. It's async (Web Crypto) and returns `Promise<boolean>`.
  `signWebhook(secret, timestamp, body)` makes the `v1=` value, for your receiver's tests. `WEBHOOK_HEADERS` gains
  `timestamp` and `signature` and loses `secret`, and `WEBHOOK_DEFAULT_TOLERANCE_SECONDS` is 300. This replaces
  `verifyWebhook(headers, secret)`, which compared the plain `X-MT-WebHook-Secret` header: that header isn't sent to
  new webhooks, and the SDK no longer accepts it. (A breaking change, made before the first release.)
- A `WebHookRegistration` has `signedOnly`: `true` when its deliveries are only signed, as for every webhook registered
  now, and `false` for one registered before deliveries were signed, which also gets its secret in
  `X-MT-WebHook-Secret`. `webhooks.update(id, { url, signedOnly: true })` stops such a webhook sending its secret, in
  place: there's no need to delete it and register it again. It can't be undone, and `false` or leaving it out changes
  nothing. The `mt` CLI does the same with `mt webhook-set ... --signed-only`.
