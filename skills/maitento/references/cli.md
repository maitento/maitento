# The mt command line

`mt` deploys projects, starts runs and follows them, and manages everything else. Overview:
`docs/reference/cli/index.md`. Every command, with its arguments and options: `docs/reference/cli/commands/index.md`
(machine-readable: `sdks/mt-commands.json`). In a terminal, `mt help` lists the commands and `mt help <command>` shows
one.

```bash
dotnet tool install --global Maitento.Shell   # needs the .NET SDK 8 or later
mt help
```

## Signing in and choosing a namespace

`mt` uses the first of these it finds, and a variable always wins over a saved setting:

| Setting | Variable | Saved with |
|---|---|---|
| the API key, `<user id>:<secret>` | `MAITENTO_API_KEY` | `mt api-login key <user id>` (it asks for the secret) |
| the namespace | `MAITENTO_NAMESPACE` | `mt ns-set <namespace>` |
| the API | `MAITENTO_BASE_URL` | `mt api-url-set <url>` |

A command's own `--namespace` (`-ns`) wins over both. `mt config-get` shows what's in use and where each value comes
from. In CI and scripts, use the variables: nothing is saved.

## The commands you'll use most

| Job | Command |
|---|---|
| start a project | `mt init <folder>`, or `mt init <folder> --example 08` (`mt init --list` lists the examples) |
| check the setup | `mt doctor <folder>` |
| model names for `model = @ref("…")` | `mt aimodel-list` |
| validate / deploy | `mt build ./maitento`, `mt deploy ./maitento` |
| see recent builds | `mt build-list` |
| run an interaction | `mt interaction-run <name> --input-<input> "<value>"` (`--stream` shows the reply as it's written) |
| run an app | `mt app-run <name> --input-<input> "<value>"` |
| run a code pipeline | `mt code-pipeline-run <name> -f start-request.json`, then `mt code-pipeline-diff <run id>` |
| start without waiting, follow later | `mt interaction-start <name>`, then `mt interaction-attach <run id>` |
| list what's running | `mt ps` |
| stop a run | `mt kill --type Interaction --id <run id>` (or `App`, `Capsule`, `CodePipeline`) |
| approve or reject a tool call | `mt interaction-approve <run id>`, `mt interaction-reject <run id> -r "<reason>"` |
| secrets | `mt secret-create <name> --value "$VALUE"`, `mt secret-update <name> --value "$VALUE"` |
| knowledge bases | `mt partition-create <name>`, `mt file-upload <file> --partition-id <id>` |
| file systems | `mt vfs-create <name>`, `mt vfs-sync <local folder> <name>` |
| webhooks | `mt webhook-set -t InteractionProcess -u <url> -s "$WEBHOOK_SECRET"` |
| delete a definition | `mt agent-delete`, `mt interaction-delete`, `mt extop-delete`, `mt connector-delete`, `mt app-delete` |

## Inputs

`--input-<name>`, with the input's name in **lower case** and spaces as dashes: `temperatureUnit` is
`--input-temperatureunit`, `User ID` is `--input-user-id`. `mt help` can't list a definition's inputs; leave one out
and `mt` lists what it needs.

## Following runs and exit codes

`*-run` follows a run until it ends and prints each status change, an app's console output and the answer. Ctrl+C
stops following, not the run. `*-start` returns once the run has started.

| Exit code | Means |
|---|---|
| `0` | it worked |
| `1` | it ran and failed: a build or deploy found errors, a followed run ended `Error` or `Killed`, `doctor` found a problem |
| `-1` (`255` on macOS and Linux) | `mt` stopped before doing anything: unknown command, bad option, no login, not found |
| `-2` (`254`) | something unexpected; `mt` prints the error |

Treat anything but `0` as a failure. Everything goes to standard output, errors included. There is no JSON output:
for results a program reads, use an SDK or the API.

## Running it without arguments

`mt` on its own opens an interactive shell, where commands are typed without `mt` and `cd` lasts for the session. The
portal's cloud shell (the **>_** button) runs the same commands in the browser, except those that need your disk
(`init`, `doctor`, `build`, `deploy`). In a script, always give `mt` a command, or it waits for one.
