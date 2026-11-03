# Deploying, and deploying from CI

Concept page: `docs/concepts/projects-and-deploys.md`. Scripting `mt`: `docs/reference/cli/index.md` ("Scripts and CI").

## Validate, then deploy

Sending a project to Maitento is a **build**. It compiles every file (`.mtr`, Cogniscript and pipeline definitions),
checks every `@ref`, then either throws the result away (**validate**) or saves it (**deploy**). Nothing is
half-saved: one error anywhere and nothing changes.

| | Check only | Save |
|---|---|---|
| `mt` | `mt build ./maitento` | `mt deploy ./maitento` |
| TypeScript, Python | `mt.validate("./maitento")` | `mt.deploy("./maitento")` |
| C# | `mt.ValidateAsync("./maitento", ns)` | `mt.DeployAsync("./maitento", ns)` |
| portal | Build studio, **Validate** | Build studio, **Deploy** |

Before either, `node scripts/check-mtr.cjs ./maitento` (from this skill's folder) checks the `.mtr` files offline,
with no key. `mt build-list` and `mt build-get <id>` show past builds and their compilation logs.

## Versions, and what a deploy leaves alone

- A deploy that changes a definition adds a new **version**; one that changes nothing reports it **Unchanged**. New
  runs use the newest version.
- **To roll back, deploy the old files again.** They become a new version; the history stays.
- An interaction is tied to the agent version that existed when it was deployed: deploy the whole folder.
- **Deploys never delete.** Removing a file leaves the definition in place: delete it with `mt agent-delete`,
  `mt interaction-delete`, `mt extop-delete`, `mt connector-delete`, `mt app-delete` and the other `*-delete`
  commands, an SDK or the portal. A definition that something else still uses can't be deleted
  (`api:<kind>:delete:in-use`).

## Setting up a namespace

A deploy only creates definitions. Anything it names that holds data must exist first, created once per namespace
(or once per tenant, for secrets), by a setup script or by hand:

| Thing | Create | Check it exists |
|---|---|---|
| namespace | `mt namespace-create <name>` (or the first deploy) | `mt namespace-get <name>` |
| secret (tenant-wide) | `mt secret-create <name> --value "$VALUE"` | `mt secret-get <name>` |
| file system | `mt vfs-create <name>` | `mt vfs-get <name>` |
| knowledge base | `mt partition-create <name>` | `mt partition-list` |
| webhook | `mt webhook-set -t <type> -u <url> -s "$SECRET"` (updates the same type and URL) | `mt webhook-get` |

Model keys belong to the tenant and are added once, in the portal or through the API: `mt doctor ./maitento` says
whether every agent's model has one.

Keep secret values in the CI system's secret store and pass them as environment variables. Never write a value into
a `.mtr` file, a prompt, a script or a start request that's committed.

## A namespace per environment

Use one namespace per environment (`shop-dev`, `shop-staging`, `shop-prod`) and pick it with `MAITENTO_NAMESPACE`,
so the same project folder deploys to each. Give CI its own API key: it can be revoked without breaking anything else.

## CI

Validate on every pull request; deploy when the main branch changes. `mt` exits non-zero when a build fails, so the
step fails with it.

```yaml title=".github/workflows/maitento.yml"
name: Maitento
on:
  pull_request:
  push:
    branches: [main]
jobs:
  maitento:
    runs-on: ubuntu-latest
    env:
      MAITENTO_API_KEY: ${{ secrets.MAITENTO_API_KEY }}
      MAITENTO_NAMESPACE: shop-prod
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'
      - run: |
          dotnet tool install --global Maitento.Shell
          echo "$HOME/.dotnet/tools" >> "$GITHUB_PATH"
      - run: mt build ./maitento
      - if: github.event_name == 'push'
        run: mt deploy ./maitento
```

```yaml title="azure-pipelines.yml"
trigger:
  branches:
    include: [main]
pool:
  vmImage: ubuntu-latest
steps:
  - task: UseDotNet@2
    inputs:
      packageType: sdk
      version: '8.0.x'
  - bash: dotnet tool install --global Maitento.Shell
    displayName: Install mt
  - bash: |
      export PATH="$PATH:$HOME/.dotnet/tools"
      mt build ./maitento
      if [ "$(Build.SourceBranch)" = "refs/heads/main" ]; then mt deploy ./maitento; fi
    displayName: Validate, and deploy from main
    env:
      MAITENTO_API_KEY: $(MAITENTO_API_KEY)   # a secret pipeline variable
      MAITENTO_NAMESPACE: shop-prod
```

- If the repository holds this skill (for example in `.claude/skills/maitento/` or `.agents/skills/maitento/`), add
  `node .claude/skills/maitento/scripts/check-mtr.cjs ./maitento` as a first step: it needs no key, so it can run on
  pull requests from forks too.
- Run the setup commands as their own step before the deploy, so a missing secret fails early with a clear name.
- A smoke test after a deploy is a run: `mt interaction-run <name> --input-<input> "<value>"` exits 1 when the run
  ends `Error` or `Killed`. It calls models, so it costs money: keep it small.
- With an SDK instead of `mt`, deploy from a short script (`await new Maitento().deploy("./maitento")`); a refused
  build throws.
