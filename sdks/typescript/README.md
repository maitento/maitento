<p align="center"><img src="https://docs.maitento.com/brand/logo-horizontal-on-light-600.png" alt="maitento" width="240"></p>

# @maitento/sdk

The official TypeScript and JavaScript SDK for [Maitento](https://docs.maitento.com): deploy agents and interactions,
run them, stream their output and react to their results. Zero runtime dependencies; Node 20+, Bun, Deno, modern
browsers and edge runtimes; ESM and CommonJS, fully typed.

```bash
npm install @maitento/sdk
```

## Quick start

Set `MAITENTO_API_KEY` to your API key (`"<user id>:<secret>"`, as the portal shows it) and `MAITENTO_NAMESPACE` to
the namespace to work in, then:

```ts
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();                       // reads MAITENTO_API_KEY, MAITENTO_BASE_URL, MAITENTO_NAMESPACE
await mt.deploy("./maitento");                   // the resource project folder
const run = await mt.interactions.run("hello");  // start, wait, return the finished run
console.log(run.output);
```

`run()` follows the run to its end: over the live event socket when one is open (with streamed tokens), by polling
otherwise. A run that ends `Error` or `Killed` throws `ProcessFailedError`.

```ts
const events = await mt.events.connect();
const run = await mt.interactions.run("hello", { inputs: { message: "Hi!" } }, {
  onToken: (text) => process.stdout.write(text),
  onWaiting: (run) => console.log("needs a person:", run.status),
});
await mt.close();
```

## What is in it

| Group | For |
|---|---|
| `namespaces`, `models`, `modelKeys`, `tenant`, `users`, `apiKeys`, `invitations` | the tenant, its model keys and people |
| `credentials`, `credentialStacks` | the tenant's own model credentials (keys and subscription sign-ins), the stacks runs use, and the default stacks |
| `agents`, `interactions`, `apps`, `capsules`, `pipelines`, `connectors`, `tools`, `automations` | definitions (`list`, `get` / `find`, `getByName` / `findByName`, create, update, delete, `start`, `run`) |
| `interactionRuns`, `appRuns`, `capsuleRuns`, `pipelineRuns`, `runs` | runs: messages, approvals, votes, answers, kill, retention, paged listing |
| `secrets`, `webhooks`, `partitions`, `files`, `vfs`, `looms` | secrets, web hooks, knowledge files, virtual file systems, memory |
| `builds`, `usage`, `events` | validate / deploy and build history, usage analytics, live events |

- `get…` throws `NotFoundError`; `find…` returns `null`.
- Paged lists (`runs.list`, `builds.list`, `partitions.files`) can be awaited for one page or iterated with
  `for await` over every item.
- Dates are `Date`s and durations are milliseconds; the SDK converts to and from the server's formats.
- Errors are typed (`ValidationError`, `AuthenticationError`, `PermissionError`, `NotFoundError`, `RateLimitError`, …,
  all `MaitentoError`). Idempotent calls are retried on network errors and 5xx gateway errors, and wait out a 429
  (`Retry-After`, or about a minute without one: `maxRateLimitRetries`, default 6); anything that starts work is never
  retried.
- `verifyWebhook()` checks a web-hook delivery's signature from its raw body, and `parseWebhook()` reads it;
  `transcript()` orders a run's conversation.

### Authentication

| Option | |
|---|---|
| `apiKey` | `"<userId>:<secret>"` or `{ userId, secret }` (default: `MAITENTO_API_KEY`) |
| `token` / `tokenProvider` | a JWT, renewed before it expires |
| `email` + `password` | a password login, renewed before it expires |

On Node 20, live events need the `ws` package: `new Maitento({ webSocket: WebSocket })` with
`import WebSocket from "ws"`. Node 22+, Bun, Deno and browsers have a WebSocket built in. In a browser, live events
need a JWT (an API key cannot authenticate a browser WebSocket).

## Documentation

- Guides and API reference: [docs.maitento.com](https://docs.maitento.com)
- Source: [github.com/maitento/maitento](https://github.com/maitento/maitento/tree/main/sdks/typescript)

## Developing this package

```bash
npm ci
npm run build         # ESM + CJS + .d.ts into dist/
npm run typecheck     # strict, including the tests
npm test              # unit tests (no network)
npm run generate      # regenerate src/models.ts and src/codec-table.ts after the wire models change
npm run route-map     # regenerate route-map.json (which call reaches each API route) for the docs
npm run test:live     # against a real API: MAITENTO_BASE_URL + MAITENTO_API_KEY (+ MAITENTO_TEST_DEEPSEEK_KEY)
```

`src/generated/` is written by `maitento/app/SdkModelGenerator` from the server itself: never edit it by hand.

## Licence

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
