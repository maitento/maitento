# Security

## Reporting a vulnerability

Please report security problems privately, never in a public issue.

Use **[Report a vulnerability](https://github.com/maitento/maitento/security/advisories/new)** on this repository's
**Security** tab. Only the Maitento team can see the report. Tell us:

- what is affected: an SDK (which one and which version), the `mt` command line, or the Maitento service;
- how to reproduce it, as briefly as you can;
- what an attacker could do with it.

We will acknowledge your report within three working days, keep you updated while we fix it, and credit you in the
advisory if you'd like.

## What is in scope

- The SDKs in [`sdks/`](sdks/) and the NuGet packages `Maitento.Sdk`, `Maitento.Entities` and `Maitento.Shell`.
- The Maitento service and portal (`api.maitento.com`, `app.maitento.com`). Test only with your own tenant and
  your own data, and never in a way that affects other tenants or the service's availability.

## Keeping your own keys safe

Maitento API keys and model keys are credentials. If one has leaked, revoke it in the portal straight away
(**Settings → API keys** or **Settings → Model keys**). See [Keeping keys safe](docs/get-started/2-api-key.md#keeping-keys-safe).
