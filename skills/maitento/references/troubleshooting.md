# Troubleshooting

Start from what Maitento said. A build names the file and line. A failed run says why in its `failureDetails`, and a
run that couldn't call a model ends with an `api:*` code in brackets. A refused request carries a code too: branch on
the code, never the message. Every code, what it means and what to do: `docs/reference/errors.md`. Each tutorial ends
with an "If it didn't work" section for its own feature, in `docs/tutorials/`.

## The build or deploy fails

| Says | Means | Do |
|---|---|---|
| `No Set node determined (<file>:<line>)` | a line has no spaces around `=` | write `name = value` |
| `Argument count mismatch for <call>` | a Cogniscript system call is missing arguments | pass every argument; `""` or `"[]"` for the unused ones |
| `Unable to resolve resource reference for secret '<name>'` | a tool or capsule names a secret that doesn't exist | create the secret first, then deploy |
| `… references ExternalOperation … which is not defined at interaction level` | a binding or auth input for a tool that belongs to an agent has no `agent` | add `agent = @ref("<agent>")` to it |
| a property is unknown, or a value is the wrong kind | the file doesn't match the kind's schema | run `node scripts/check-mtr.cjs ./maitento`; read `docs/reference/project-files/` for the kind |
| `api:connectors:address-blocked` | a connector's URL is private, loopback or internal, or `auth = "Maitento"` with another host | use a public address |
| `api:connectors:secret-missing` | a connector needs a secret in a header and nothing gives one | set the tool's `auth`, or accept the secret as a run input |
| `api:definitions:version-conflict` | another deploy to the same namespace ran at the same time | deploy again |
| the deploy succeeds but nothing changed | the deploy went to another namespace, or the files were unchanged | check `mt ns-get` / `MAITENTO_NAMESPACE`; `mt build-list` |

## A run is refused before it starts

Nothing is created and nothing is spent.

| Code | Means |
|---|---|
| `api:interactions:input-required` | a required input wasn't given (the message names it) |
| `api:interactions:input-empty` | a required input was given empty, and has no default |
| `api:interactions:input-unknown` | an input the interaction doesn't declare; names are case-sensitive |
| `api:interactions:input-invalid` | a value isn't of the input's type |
| `api:interactions:not-found` | no such interaction in that namespace: check the name and `MAITENTO_NAMESPACE` |
| `api:apps:input-missing` | every app input is required |
| `api:web:download-partition-required` | the agents can fetch web pages and nothing names a knowledge base to keep them in |
| `api:billing:out-of-credit` | the tenant can't pay for more work: top up or upgrade |
| `api:billing:allowance-used` | the plan's allowance for this kind of work is used for the period |
| `api:billing:premium-not-included` | the plan doesn't include capsules and code pipelines |
| `api:rate-limited` | too many requests: wait `retryAfterSeconds` |

## A run ends `Error`

| In `failureDetails` | Means | Do |
|---|---|---|
| `[api:model-keys:none-for-provider]` | no model key for the agent's provider | add one in the portal (Settings, Model keys), or change `model` to a provider you have a key for |
| `[api:model-keys:all-failed]` | every key for the provider failed: authentication, quota or endpoint | check the key with the provider and replace it |
| `[api:credentials:all-failed]`, `[api:credentials:no-usable-credential]` | the run's credential stack can't serve the model | test the credential; add one that serves the model |
| `Unable to parse JSON result` | three answers in a row didn't match `schema.solution` | simplify the schema; allow `null` for what may be missing; describe fields |
| `Interaction timed out` | `duration.max` ran out | raise it, or give the work less to do |
| `<Call> failed: …` | a system call in an app failed | read the reason; e.g. an interaction name that isn't in the namespace |
| your own `throw` message | the app stopped itself | the message says why |

An app's children are its interaction runs: when one fails, open it in the portal's **Runs** to see why, or read its
`failureDetails` from the object `InteractionAwait` returned. `mt process-list` lists recent runs of every type.

## The run works but the answer is wrong

- **No tool call, and the answer is made up:** the agent answered from memory. Check the deploy succeeded, the
  agent's `functions` or the interaction's `functions.openApi` lists the tool, and the prompt says when to use it.
- **A tool's result is an error:** read it on the run. `Error connecting to remote API` means the address couldn't be
  reached in time; a status code means your server refused the call.
- **The model gets an id or a unit wrong:** bind it (`bindings.*` on the tool, or `inputs.functions.binding` from the
  run) so the model never chooses it.
- **A knowledge search finds nothing:** the files aren't indexed yet (`isVectorGenerated`), there's no embeddings key
  (`api:embeddings:fallback-not-permitted`), or an old copy of a changed file is still there.
- **The agent forgets between runs:** memory's default `scope` is `Process`, one run only. Use `Input` or
  `Interaction`.
- **An interaction still uses the old agent:** deploy the whole folder, not just the agent.

## The command line

| Problem | Do |
|---|---|
| `You are not logged in to Maitento` | set `MAITENTO_API_KEY` to `<user id>:<secret>` (the user's id, not the key's), or `mt api-login key <user id>` |
| `Unrecognized command or argument '--input-…'` | input options are lower case: `--input-temperatureunit` |
| a command waits forever in a script | `mt` with no command opens the interactive shell: always give it one |
| exit code `255` or `254` | `-1` or `-2` on macOS and Linux: `mt` stopped before doing anything, or hit something unexpected |
| unsure what's set up | `mt doctor ./maitento` and `mt config-get` |

## Code pipelines

- **Cloning or pushing fails:** check the repository URL (`https`, ending `.git`) and the credentials
  (`<user>:<token>`), and that the token can write to it.
- **A step fails at once mentioning model keys:** the engine uses the tenant's key for its provider (`DeepSeek`
  needs a DeepSeek key).
- **The hook never runs:** the hook folder must have the pipeline's name, and `postHook` must name a function in it
  exactly.
- **The loop never ends well:** read the variable the tests report into. If the tests can't start at all, fix the test
  step's prompt, not the code. Every fix is committed: delete the branch before trying again.
