# Changelog

All notable changes to the `maitento` Python package. Versions are shared with the other Maitento SDKs (`YY.M.N`).

## 26.11.1 (2026-11-03)

- First release: `Maitento` (blocking) and `AsyncMaitento` (asyncio) clients covering every public API route,
  `deploy()`/`validate()` for resource projects, `run()` helpers with token streaming, live events over the
  `/notifications` WebSocket, typed errors, paged lists, and web-hook verification helpers.
- Deploying needs a tenant admin: anyone else is refused with a 403, code `api:builds:deploy-requires-admin`. Any
  member can still `validate()`.
- A `run()` helper's errors word a run the same way in every Maitento SDK: `App run <id> ended Error: <failure
  details>` (`... ended Killed.` when the run recorded nothing), and `Interaction run <id> did not finish within 2s.`
- `automations.trigger()` raises `ValidationError` with code `api:automations:start-failed` (followed by the cause's
  own codes) when no action could start, instead of returning an empty process id. Creating or updating an automation
  whose app action leaves out one of the app's inputs is refused with `api:automations:app-input-missing`.
- Usage: `toolCalls` (on `/usage/runs` rows and the usage totals) counts an interaction run's tool calls too; it was 0
  for every interaction run.
- Starting an interaction, an app or a code pipeline takes `credential_stack` (the stack's id or name) to run on that
  credential stack: its credentials serve the run, and Maitento's own keys never do. An app's stack is the stack of
  every run it starts. Naming a stack and passing `credentials` at once is refused with
  `api:credential-stacks:with-credentials`; naming one the tenant hasn't got, with `api:credential-stacks:unknown`.
- Interactions, apps and code pipelines can name their own credential stack (`credential_stack` on their versions and
  on the interaction update and pipeline create requests; `credentialStack` in an `.mtr` file or `pipeline-definition.json`):
  runs that don't name one at the start use it before the namespace's and the tenant's default.
- `credentials` and `credential_stacks` manage the tenant's own model credentials and the stacks runs use them
  through. `credentials`: `list(tag=)`, `get`, `find`, `create`, `update`, `delete`, `delete_by_tag` (returns how
  many), `test`, and `start_sign_in`/`finish_sign_in` to sign a Claude Code or Codex subscription in as a credential.
  Keys are write-only: only each key's `key_hint` is served; an update keeps a key sent by `id` alone, or with the value
  it already has. `credential_stacks`: `list`, `get`, `find`, `create`,
  `update`, `delete`, and `get_tenant_default`/`set_tenant_default` and
  `get_namespace_default`/`set_namespace_default` (`None` clears a default).
- An Anthropic credential can reach Claude on Amazon Bedrock or Google Vertex AI: `cloud={"kind": "Bedrock",
  "awsRegion": ...}` or `{"kind": "Vertex", "gcpProjectId": ..., "gcpRegion": ...}` (endpoint kinds `Bedrock` and
  `Vertex`), with the Bedrock API key or the service account's JSON key file as its key. Only code pipelines' Claude Code
  agents run on it; testing it answers `api:credentials:test-not-supported`; a cloud that can't be reached is refused
  with `api:credentials:cloud-invalid`.
- On a credential stack, a model an agent override defines inline (`custom_model`) and a coding agent on your own
  endpoint (`CustomAnthropic`, `CustomOpenAiResponses`, `CustomOpenAiChat`) run on the stack's credentials that have
  their own endpoint, for the model's API, and name the model in `models`; they had no credential on a stack before.
- `credential_stacks.find_by_name(name)` (`GET /credential-stacks/by-name/{name}`): a stack by its name, or `None`.
- `credentials.test_unsaved(...)` (`POST /credentials/test`): tests a credential before saving it, with what `create`
  takes, and stores nothing.
- `credential_stacks.usage(id)` (`GET /credential-stacks/by-id/{id}/usage`): whether a stack is the tenant's default,
  the namespaces whose default it is, and the knowledge bases that embed with it.
- `credentials.import_sign_in(tool=, access_token=, refresh_token=, expires_at_utc=, id_token=)` makes an OAuth
  credential from a sign-in whose tokens you already hold, and `replace_sign_in_tokens(id, ...)` swaps them after you
  refresh: Maitento never refreshes such a sign-in itself (`oauth.refreshed_by_caller`). Each route refuses the other
  kind of sign-in (`api:credentials:sign-in-refreshed-here`, `api:credentials:sign-in-refreshed-by-caller`).
- An automation's `app` and `interaction` actions take `credential_stack` (the stack's id or name) for the runs they
  start, as a `codepipeline` action's `request` does. Saving an action that names a stack the tenant hasn't got is
  refused with `api:credential-stacks:unknown`; a pipeline action with a stack and `credentials` of its own, with
  `api:credential-stacks:with-credentials`.
- `partitions.set_embedding_credential_stack(id, stack_id)` (`None` clears it): a knowledge base embeds on its own
  credential stack (`embedding_credential_stack_id` on `Partition`), after its own embedding keys and in place of the
  tenant's model keys and default stack, never on Maitento's key. Deleting a stack a knowledge base embeds with is
  refused with `api:credential-stacks:in-use-by-partition`.
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
  `PartitionEmbeddingCredentialFailure` with `failure_reason` `IndexingDisabled` and `credential_id` `maitento-fallback`
  (listed by `GET /partitions/embedding-credential-failures`), so you can tell your admins.
- `capsule_runs.exec_and_wait(id, command, arguments, timeout=..., abort=...)` queues a command and waits for it to
  end, over live events when a stream is open and by polling the one command otherwise; it returns the command with
  its exit code and output, and raises the new `CapsuleCommandAbortedError` when the capsule ends first.
  `capsule_runs.get_command(id, command_id)` reads one command (`GET /capsule-processes/by-id/{id}/commands/{commandId}`).
- Secrets are write-only: `secrets.value(name)` and its route, `GET /secrets/by-name/{name}/value`, are removed, so
  nothing reads a stored value back. Replace a value with `secrets.update` instead.
- Code pipeline repositories take `is_read_only` (`isReadOnly` in the API): a read-only repository is cloned as context for
  the agents, but a run never commits, pushes or diffs it. It defaults to `false`.
- `tenant.set_retention(hours=)`: a tenant admin sets how long finished runs are kept, up to the plan's maximum (the new
  `plan_max_hours` in `tenant.retention()`); `hours=None` goes back to the platform default. A retained run is kept for
  at most the plan's maximum, and its retention status says when that is (`lease_ends_at_utc`).
- `runs.lane(id, type=)`: whether a run is waiting for a lane before it starts, since when, why (`LANES_IN_USE` or
  `PLATFORM_BUSY`), and how many of your runs are ahead of it. Runs and run lists carry `waiting_for_lane_since_utc`.
- `billing`: the tenant's plan and billing. `standing()` (the plan and its state, the balance, whether work can start,
  any plan change on its way, and this month's use of each allowance), `plan()`, `balance()`, `catalogue()` (the
  plans on sale), `notices(limit=)`, and the balance settings: `auto_top_up()` / `set_auto_top_up()` and `alerts()` /
  `set_alerts()`. Buying a plan or credit, and changing the plan, stay in the portal. The standing also says when the
  balance is low (`low_balance`, by the alert settings) and when the subscription renews (`term_ends_at_utc`).
- `TenantRegisterRequest`: `code` is optional, and there's a new `turnstileToken`. Where sign-up is open, a tenant can be
  registered without an invitation code, with the sign-up page's Cloudflare Turnstile token instead.
- Sign-in with GitHub, Google and Microsoft is a portal flow under `/auth/sso`, which the SDK doesn't wrap (an SDK
  client has no browser to send to a provider). Its request and response models are generated: `SsoProvider`,
  `SsoProvidersResponse` (with `sign_up_open` and the `start_base_url` a sign-in starts from), `SsoExchangeRequest`
  and `SsoConfirmLinkRequest`.
- A `Billing` webhook type: a `BillingNotice` is delivered when your tenant runs out of credit or gets it back
  (`OutOfCredit`, `CreditRestored`), uses up an allowance (`AllowanceUsed`), runs low (`LowBalance`), its plan changes
  (`PlanChanged`, `PlanRestored`, `MovedToFree`), a renewal payment fails (`PaymentFailed`, then `FreezeReminder` and
  `FreezeEnded`), or an automatic top-up can't be charged (`AutoTopUpFailed`). It carries the `meter`, `balance`,
  `currency`, `tier`, `previousTier` and `frozenUntilUtc` where they apply.
- Web-hook deliveries are signed. `verify_webhook(headers, body, secret, *, tolerance=300, now=None)` now checks
  `X-MT-WebHook-Signature` (`v1=` and the HMAC-SHA256 of `"{timestamp}." + body`, keyed with your secret) against the
  **raw** body, and refuses a delivery whose `X-MT-WebHook-Timestamp` is more than 5 minutes from now, so a delivery
  can't be forged by someone who saw another, or replayed. `sign_webhook(secret, timestamp, body)` makes the `v1=`
  value, for your receiver's tests; `maitento.webhooks` has `TIMESTAMP_HEADER`, `SIGNATURE_HEADER` and
  `DEFAULT_TOLERANCE`. `parse_webhook(headers, body, secret=...)` verifies the signature the same way (so `body` must
  then be raw). This replaces `verify_webhook(headers, secret)`, which compared the plain `X-MT-WebHook-Secret`
  header: that header isn't sent to new webhooks, and the SDK no longer accepts it (`SECRET_HEADER` is gone). (A
  breaking change, made before the first release.)
- A `WebHookRegistration` has `signed_only`: `True` when its deliveries are only signed, as for every webhook
  registered now, and `False` for one registered before deliveries were signed, which also gets its secret in
  `X-MT-WebHook-Secret`. `webhooks.update(id, url=..., signed_only=True)` stops such a webhook sending its secret, in
  place: there's no need to delete it and register it again. It can't be undone, and `False` or leaving it out changes
  nothing. The `mt` CLI does the same with `mt webhook-set ... --signed-only`.
