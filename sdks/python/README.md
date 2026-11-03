<p align="center"><img src="https://docs.maitento.com/brand/logo-horizontal-on-light-600.png" alt="maitento" width="240"></p>

# Maitento Python SDK

The official Python SDK for [Maitento](https://docs.maitento.com), the AI OS: deploy agents and interactions, run
them, stream their answers, and react to what they do.

```bash
pip install maitento
```

Python 3.10 or newer. It depends on `httpx`, `pydantic` (v2) and `websockets`.

## Quick start

```python
from maitento import Maitento

mt = Maitento()                          # reads MAITENTO_API_KEY, MAITENTO_BASE_URL, MAITENTO_NAMESPACE
mt.deploy("./maitento")                  # the resource project folder
run = mt.interactions.run("hello")       # start, wait, return the finished run
print(run.output)
```

`MAITENTO_API_KEY` is `"<userId>:<secret>"`, as the portal shows it: the id of the user that owns the key, a colon,
then the secret. The same code runs on asyncio with `AsyncMaitento` and `await`:

```python
import asyncio
from maitento import AsyncMaitento

async def main() -> None:
    async with AsyncMaitento() as mt:
        run = await mt.interactions.run(
            "haiku",
            inputs={"topic": "autumn"},
            on_token=lambda text, agent: print(text, end="", flush=True),
        )
        print("\n", run.status)

asyncio.run(main())
```

## What is in it

- **Every API resource** as a method group: `namespaces`, `models`, `model_keys`, `agents`, `interactions`,
  `interaction_runs`, `apps`, `app_runs`, `capsules`, `capsule_runs`, `pipelines`, `pipeline_runs`, `runs`,
  `connectors`, `tools`, `secrets`, `webhooks`, `partitions`, `files`, `vfs`, `looms`, `automations`, `builds`,
  `usage`, `users`, `api_keys`, `invitations`, `tenant`, `events`.
- **`get` vs `find`**: `get…` raises `NotFoundError`; `find…` returns `None`.
- **`run()` helpers** for interactions, apps, capsules and pipelines: start once (never retried), follow the run
  over the live event socket or by polling, call `on_token` / `on_update` / `on_waiting`, and return the finished run
  (or raise `ProcessFailedError`).
- **Live events** (`mt.events.connect()`): callbacks with `on(...)` or a plain `for event in stream` loop, with
  automatic pings, reconnects and a `reconnected` event.
- **Typed errors** (`ValidationError`, `NotFoundError`, `RateLimitError`, ...), all derived from `MaitentoError`.
  Calls that only read are retried on network errors, 429 and 502/503/504, honouring `Retry-After`.
- **Paged lists** you can iterate across pages: `for run in mt.runs.list(state="Terminal"): ...`
- **Web-hook helpers** for your receiver: `verify_webhook(headers, body, secret)` checks a delivery's signature from
  its raw body, and `parse_webhook(headers, body)` reads it.
- **Generated wire models** (pydantic v2) that tolerate new fields and new enum values from a newer server.

## Links

- Documentation: <https://docs.maitento.com>
- Source: <https://github.com/maitento/maitento>
- Changelog: [CHANGELOG.md](https://github.com/maitento/maitento/blob/main/sdks/python/CHANGELOG.md)

Licensed under the Apache License, Version 2.0.
