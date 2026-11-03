---
title: The mt command line
description: Install mt, sign it in, and run it one command at a time, as an interactive shell or in the portal's cloud shell. Paths, quoting, output, exit codes and scripting.
sidebar:
  label: Overview
  order: 120
---

# The mt command line

`mt` is Maitento's command line. It deploys projects, starts runs and follows them, and manages everything else:
file systems, knowledge bases, secrets, webhooks, keys. This page covers what every command shares. Each command's
arguments and options are in [Commands](commands/index.md), by area. For what the shell is and when to use it rather
than an SDK or the portal, see [The shell](../../concepts/shell.md).

## Install

```bash
dotnet tool install --global Maitento.Shell
mt help
```

- **You need .NET.** Installing a .NET tool needs the .NET SDK, version 8 or later. `mt` then runs on the .NET 8
  runtime or any later one.
- **`mt` not found?** Global tools go in `.dotnet/tools` in your home folder. Add that folder to your `PATH`.
- **To update,** run `dotnet tool update --global Maitento.Shell`.
- **`mt help`** lists every command, by area. **`mt help <command>`** shows one command's arguments and options.
  Neither needs you to be signed in.

## Sign in

`mt` signs in with the first of these it finds:

1. **`MAITENTO_API_KEY`**, an API key written `<your user id>:<your secret>`. It's the line the portal gives you when
   you [create an API key](../../get-started/2-api-key.md), and the SDKs read the same variable. Nothing is saved,
   so this is the way to use `mt` in CI and scripts.
2. **A saved login**, from `mt api-login`.

To save a login, give `api-login` the key:

```bash
mt api-login key "$MAITENTO_API_KEY"
```

- **Leave the secret off** (`mt api-login key <your user id>`) and `mt` asks for it without showing what you type.
  When standard input is piped, it reads the secret from there instead, so it never sits in your shell history.
- **`mt api-login user <email>`** signs in with your email address and password instead. The API key commands
  (`api-key-create`, `api-key-list` and `api-key-delete`) need this kind of login: an API key can't manage keys.
- **`api-login` checks the login with the API first.** One the API rejects isn't saved. `--no-verify` saves it
  without checking.
- **The user id is yours, not the key's.** The portal shows it with the secret. A key's own id never signs in.
- **Where it's kept:** in `settings.json` (see [Settings](#settings-and-verbose-logging)). On Windows it's encrypted
  for your Windows account. On macOS and Linux it is **not encrypted**: it's in a file only your user can read. Where
  that matters, keep the key in your own secret store and use `MAITENTO_API_KEY`.

With neither, a command that needs Maitento stops and says what to do:

```text
You are not logged in to Maitento. Set MAITENTO_API_KEY=<userId>:<secret>, or run 'mt api-login key <userId>:<secret>' (or 'mt api-login user <email>').
```

When the API refuses a key, `mt` says which credential it used: the variable or the saved login.

## The API and the namespace

| Setting | Environment variable | Saved with | Default |
|---|---|---|---|
| The API | `MAITENTO_BASE_URL` | `mt api-url-set <url>` | `https://api.maitento.com` |
| The namespace | `MAITENTO_NAMESPACE` | `mt ns-set <namespace>` | none |
| The login | `MAITENTO_API_KEY` | `mt api-login` | none |
| Where settings are kept | `MAITENTO_CONFIG_DIR` | | `.maitento` in your home folder |

- **A variable wins over a saved setting,** for that process only. Variables are never saved.
- **Commands that work in a namespace take `--namespace`** (or `-ns`), which wins over both. So the order is: the
  command's own `--namespace`, then `MAITENTO_NAMESPACE`, then the namespace `ns-set` saved. `mt help <command>`
  shows whether a command takes it.
- **`ns-set` doesn't check the namespace exists.** Your first deploy to a namespace creates it, or run
  `mt namespace-create <name>`.
- **File system paths name their own namespace**, so `--namespace` doesn't apply to them: see
  [Files and the working path](#files-and-the-working-path).
- **`mt ns-get` and `mt api-url-get`** show the value in use and where it comes from.

`mt config-get` shows all of it at once, and where each value comes from:

```text
$ mt config-get
+--------------------+---------------------------------------------------------+
| Key                | Value                                                   |
+--------------------+---------------------------------------------------------+
| api url            | https://api.maitento.com                                |
| signed in with     | API key for user <your user id> (from MAITENTO_API_KEY) |
| saved login        | -                                                       |
| default namespace  | tutorials (from MAITENTO_NAMESPACE)                     |
| verbose logging    | False                                                   |
| interaction author | not set                                                 |
| settings file      | …                                                       |
+--------------------+---------------------------------------------------------+
```

## Three ways to run it

| | Runs on | Signs in with | Sees |
|---|---|---|---|
| [One command at a time](#one-command-at-a-time) | your computer | `MAITENTO_API_KEY` or a saved login | your disk and your file systems |
| [Interactive](#interactive) | your computer | `MAITENTO_API_KEY` or a saved login | your disk and your file systems |
| [Cloud shell](#the-cloud-shell) | Maitento, in your browser | your portal session | your file systems |

The commands are the same in all three, apart from the few that need your computer, which the cloud shell
[can't run](#not-in-the-cloud-shell).

### One command at a time

`mt <command> [arguments] [options]` runs one command and exits with its [exit code](#exit-codes). Your own shell,
bash or PowerShell, splits and quotes the arguments, so its rules apply.

Each `mt` starts afresh, in the folder you run it from. A `cd` doesn't carry over to the next `mt`.

### Interactive

`mt` with no arguments clears the screen and opens a prompt. It lists the commands it loaded, then shows the working
path. Type commands without `mt` in front:

```text
Maitento Core loaded: [action-create, action-delete, …, write]
[/local/C/…/hello] $ ns-get
Default namespace set to tutorials (from MAITENTO_NAMESPACE; the saved one is not set)
[/local/C/…/hello] $ exit
```

- **`cd` lasts** for the rest of the session, so you can move around your disk and your file systems.
- **`clear`** clears the screen. **`exit`** closes the shell, and so does the end of input (Ctrl+D, or Ctrl+Z then
  Enter on Windows). `help` lists them under "Shell".
- **Ctrl+C at the prompt closes `mt`.** While a command is following a run, it only stops following
  ([Following runs](#following-runs)).

The interactive shell and the cloud shell split a line the same way:

- **Spaces separate** arguments. **Double quotes** group words: `--content "# Shopping list"`.
- **`\"`** is a literal double quote, inside quotes or out.
- **Single quotes are ordinary characters**, so `'two words'` is two arguments.
- **Backslashes are otherwise ordinary.** `C:\data` stays as you typed it, and `\n` is not a new line.
- **`""` on its own passes nothing**, so you can't set an option to empty text this way.
- **There are no variables, pipes or redirects.** `$HOME`, `|` and `>` are passed to the command as typed. For
  those, run one command at a time from your own shell.

### The cloud shell

In the [portal](https://app.maitento.com), the **>_** button in the top bar (or **Ctrl+`**) opens the **cloud
shell**: the same `mt`, running on Maitento and signed in as you. There's nothing to install and no key to set. The
command palette's **Open cloud shell** does the same.

- **It starts in the namespace selected in the portal.** The prompt shows your tenant, the namespace and the working
  path. `ns-set` changes the namespace for this session only.
- **Tab completes** command names, and a command's options after `-`. **↑** and **↓** go through your history,
  **Ctrl+C** stops following a run, and **Ctrl+L** clears the screen.
- **Paste several lines** and it asks before running them, one after another.
- **The file system is yours, under `/vfs`,** and the shell starts there. There is no `/local`: the cloud shell has
  no disk of yours to see.
- **Settings last for the session.** `ns-set`, `verbose-set` and `interaction-author-defaults-set` change this
  session only, and the environment variables don't apply.
- **A session closes** after 30 minutes with no activity, or after 8 hours at most. One command can run for up to
  60 minutes and show up to 1,048,576 characters, and `cat` can't read a file larger than 8 MiB. Opening too many
  sessions at once closes your oldest.

Anyone in your tenant who signs in to the portal can open one. An API key can't.

#### Not in the cloud shell

These commands need your computer, so the cloud shell answers them with the reason instead, and exit code `-3`:

| Command | Why | Instead |
|---|---|---|
| `build`, `deploy` | they read a project from your disk | the portal's Build studio |
| `init` | it writes a project to your disk | open an example in Build studio |
| `doctor` | it checks your computer's setup | run it on your computer |
| `vfs-sync` | it mirrors a folder on your disk | **Upload a folder** in the portal's file system explorer |
| `file-upload`, `file-update` | they upload a file from your disk | **Upload files** on the knowledge base's page in the portal |
| `file-download` | it saves a file to your disk | `file-text` shows its text |
| `credential-apply`, `code-pipeline-update-credentials`, `code-pipeline-update-repos`, `partition-embedding-credentials-set`, `partition-embedding-probe` | they read keys and credentials from a file on your disk | run them on your computer |
| `api-login` | the cloud shell is already signed in as you | |
| `api-url-set` | the cloud shell always talks to this Maitento | |

An option that reads a file from your disk, such as `code-pipeline-start --request-file`, can't be used there
either.

### Inside a sandbox

Every [sandbox](../../concepts/capsules.md) (capsule) has `mt` installed. Its default user is signed in as whoever
started it, with the sandbox's namespace set, so a script in the sandbox can call Maitento without a key of its own.

## Files and the working path

`mt`'s file commands see one tree, with your disk and your file systems side by side:

| Path | Is |
|---|---|
| `/` | lists `/local` and `/vfs` |
| `/local/...` | your own disk. On macOS and Linux, `/srv/data` is `/local/srv/data`; on Windows, `D:\data` is `/local/d/data` |
| `/vfs` | lists every [file system](../../concepts/file-systems.md) you can see, in every namespace, as `name@namespace` |
| `/vfs/<name>@<namespace>/...` | a file in a file system |

- **On your computer, `mt` starts in the folder you run it from,** so relative paths work as you'd expect:
  `mt cat notes.md`, `mt deploy ./maitento`. The cloud shell starts in `/vfs`.
- **An absolute path is one of these shell paths.** Write `/local/d/data`, not `D:\data`: on Windows,
  `mt init D:\data` is refused as "not a folder on this computer's disk".
- **`cd`, `ls`, `cat`, `cp`, `mv`, `rm` and `mkdir` work on both.** `cp` copies between them, which is how you upload a
  file or a folder: `mt cp ./report.csv /vfs/notes@tutorials/report.csv`.
- **`write`, `edit`, `find`, `tree`, `exists`, `batch-read` and `batch-edit` work on file systems only,** and take the
  full `/vfs/<name>@<namespace>/...` path: they don't use the working path.
- **`vfs-sync <folder> <name>`** makes the file system `<name>` an exact copy of a folder on your disk. It creates the
  file system if it needs to, and deletes files that aren't in the folder.
- **Every file command needs you to be signed in,** even one on your own disk.

## Arguments and options

- **Arguments** are positional, in the order `mt help <command>` lists them. **Options** are named:
  `--name value`, `--name=value` and `--name:value` are the same.
- **A flag on its own is on:** `--stream`, `--confirm`, `--force`.
- **An option `mt` doesn't know is an error**, so a mistyped option never runs a command without it:

  ```text
  $ mt init hello --bogus
  Unrecognized command or argument '--bogus'.
  ```

- **Some deletes need `--confirm`.** Without it, deleting a definition (an agent, app, interaction, capsule or code
  pipeline), a namespace, a credential or memory only says what it would delete, and stops. Others, such as `rm` and
  `secret-delete`, delete at once. `mt help <command>` says which.

### Inputs: `--input-<name>`

`app-start`, `app-run`, `interaction-start`, `interaction-run`, `code-pipeline-start` and `code-pipeline-run` take
the definition's inputs as options, and `app-patch-inputs` changes a live app run's. `mt` reads what the deployed
definition expects, then wants one `--input-<name>` for each: the input's name in lower case, with spaces as dashes.

```bash
mt app-run taglines --input-product "a reusable bamboo coffee cup"
```

- An input called `User ID` is `--input-user-id`.
- **Every app input is required.** An interaction or code pipeline needs its required inputs.
- **`mt help app-run` can't list them,** because they depend on what you've deployed. Leave one out and `mt` lists
  the inputs it needs.
- **An interaction whose agents use [memory](../../concepts/memory.md)** also takes `--loom-<agent name>`, to choose
  each agent's loom.

## Following runs

| Command | Does | Exit code |
|---|---|---|
| `app-start`, `interaction-start`, `code-pipeline-start` | starts a run, prints its id and returns | `0` once it has started |
| `app-run`, `interaction-run`, `code-pipeline-run` | starts a run and follows it until it ends | `1` if it ends `Error` or `Killed` |
| `app-attach`, `interaction-attach`, `code-pipeline-attach` `<id>` | follows a run that's already going | `1` if it ends `Error` or `Killed` |

While it follows a run, `mt` prints each change of status, an app's console output, outputs and the answer, and when a
run fails, why. `interaction-run --stream` shows the reply as it's written. Here is `interaction-run` from
[Get started](../../get-started/5-first-agent.md):

```text
$ mt interaction-run hello
Connecting to notification system...
Connected to notification system
Requesting interaction start...
Started 'hello@tutorials' with pid 197d0f44-26bd-45ce-9259-9cf61981ad0c
Status: Running
Waiting for interaction... (Ctrl+C stops watching; the run carries on)
[Greeter] I am functioning well, thank you for asking. How may I assist you with your task today?
Output: I am functioning well, thank you for asking. How may I assist you with your task today?
Status: Finished
```

- **Ctrl+C stops following, not the run.** The run carries on, and `mt` prints the `*-attach` command that follows it
  again.
- **Sandboxes** have no `-run`: `capsule-start` returns at once, and `capsule-command-await` waits for one command.
- **`mt notifications`** shows live events as they happen, until you press Ctrl+C.
- **`mt kill --type <App|Interaction|Capsule|CodePipeline> --id <id>`** stops a run.

## Output

- **In a terminal,** `mt` uses its own colours on a dark background, wraps text to the window and draws tables with
  box lines. The cloud shell follows the portal's light or dark theme.
- **Otherwise it's plain text,** with no colour codes, no wrapping, and tables drawn in ASCII. That's when output or
  input is redirected or piped, and when one of these variables is set: `CI`, `GITHUB_ACTIONS`, `GITLAB_CI`,
  `TF_BUILD` (Azure Pipelines), `JENKINS_HOME`, `TEAMCITY_VERSION`, `CIRCLECI`, `TRAVIS` or `BUILDKITE`.
- **Tables fit the width:** the terminal's, or 120 columns without one. Values too long for it are cut short.
- **Everything goes to standard output,** errors included. Use the exit code to tell whether a command worked.
- **There's no JSON output.** `mt`'s tables are for people. For results a program reads, use an SDK or the API.

```text
$ mt init --list
+-------------------------+----------------------+------------------------+
| name                    | title                | languages              |
+-------------------------+----------------------+------------------------+
| 00-connect              | Connect              | TypeScript, Python, C# |
| 01-hello-agent          | Hello, agent         | TypeScript, Python, C# |
| 02-prompts-and-inputs   | Prompts and inputs   | TypeScript, Python, C# |
…
```

## Exit codes

| Code | Means |
|---|---|
| `0` | It worked. |
| `1` | The command ran, and what it did failed: a build or deploy found errors, a run you followed ended `Error` or `Killed`, `doctor` found a required check failing, or the API refused a login or a delete. |
| `-1` | `mt` stopped before doing anything: an unknown command, a missing or invalid argument or option, no login, a key the API rejected, or something that doesn't exist. |
| `-2` | Something unexpected went wrong. `mt` prints the error in full. |
| `-3` | In the cloud shell: the command [isn't available there](#not-in-the-cloud-shell). |

A few commands use other values of their own, so treat anything but `0` as a failure. On macOS and Linux, an exit
code is a number from 0 to 255, so `-1` arrives as `255` and `-2` as `254`. On Windows, `$LASTEXITCODE` and
`%ERRORLEVEL%` show `-1` as it is.

## Scripts and CI

```bash
mt deploy ./maitento && mt app-run taglines --input-product "a reusable bamboo coffee cup"
```

- **Sign in with `MAITENTO_API_KEY`** from your CI system's secret store, and set `MAITENTO_NAMESPACE`. Nothing is
  saved, and a key of its own for CI can be revoked without breaking anything else.
- **`mt deploy` exits non-zero** when a file is wrong, and deploys nothing. `mt build ./maitento` runs the same checks
  without deploying.
- **A job that deploys needs a tenant admin's key.** A member's key can run `mt build`, but `mt deploy` is refused
  with `api:builds:deploy-requires-admin`.
- **`*-run` exits `1`** when the run fails, so the CI step fails with it.
- **Nothing asks a question** except `api-login` when you leave the secret off, and that reads a piped standard input.
- **Always give `mt` a command.** `mt` on its own waits for you to type one.

## mt init and mt doctor

**`mt init <folder>`** starts a project: the smallest one that runs, an agent and a one-shot interaction. Add
`--lang ts`, `python` or `csharp` for a script that deploys and runs it. `--example <name>` copies a tutorial's example
instead (`--example 01`, `--example hello-agent` and `--example 01-hello-agent` all work), and `--list` lists them.
The examples are built into `mt`, so it works offline and matches your version. A folder that already holds files is
left alone unless you pass `--force`.

Either way, `mt init` also writes the files an AI coding agent needs: `AGENTS.md`, and the
[Maitento skill](../../guides/ai-coding-agents.md) in `.claude/skills/maitento` (for Claude Code) and
`.agents/skills/maitento` (for Codex, Cursor, GitHub Copilot, Gemini CLI and others). It never writes one over a file
that's already there, even with `--force`. Pass `--no-agent-files` to leave them out.

```text
$ mt init hello
Created a Maitento project in …/hello:
  README.md
  maitento/agents/greeter.mtr
  maitento/interactions/one-shot/hello.mtr

For AI coding agents:
  AGENTS.md  what to read first
  .claude/skills/maitento/  the Maitento skill, for Claude Code
  .agents/skills/maitento/  the same skill, for Codex, Cursor, GitHub Copilot, Gemini CLI and others

Next:
  cd hello
  mt deploy ./maitento
  mt interaction-run hello

Set MAITENTO_API_KEY and MAITENTO_NAMESPACE first, then check your setup with 'mt doctor' (run it in hello).
```

**`mt doctor [folder]`** checks everything a first run needs, in order, one line each with the fix when one fails:
the API answers, your credential works, the namespace exists, what runs pay for models with
([credential stacks](../../concepts/credentials.md) or [model keys](../../concepts/models-and-keys.md)), a credential
for every model the project's agents use, and the Node.js, Python and .NET versions the examples need. It exits `1`
when a required check fails:

```text
$ mt doctor
Checking your Maitento setup against https://api.maitento.com

✔ API         https://api.maitento.com answers
✘ Credential  none: nothing to sign in with
              Fix: You are not logged in to Maitento. Set MAITENTO_API_KEY=<userId>:<secret>, or run 'mt api-login key <userId>:<secret>' (or 'mt api-login user <email>').
- Namespace   not checked: not signed in
…
1 required check failed: fix it and run 'mt doctor' again.
```

## Settings and verbose logging

`mt` keeps its settings in `settings.json`, in `.maitento` in your home folder, or in the folder `MAITENTO_CONFIG_DIR`
names. The file holds the API URL, the saved login, the namespace, the verbose logging switch and the default
interaction author. Only your user can read it.

- **`mt config-get`** shows the settings in effect ([example above](#the-api-and-the-namespace)).
- **`mt verbose-set true`** makes `mt` also log what it does underneath, such as signing in and connecting to live
  events. It takes effect the next time `mt` starts. `mt verbose-get` shows the setting.
- **`mt interaction-author-defaults-set`** sets the name and id recorded as the author of the messages and votes you
  send to interaction runs from the shell. `interaction-author-defaults-clear` records them as you again.

## Commands by area

Every command, with its arguments and options, is in [Commands](commands/index.md). By area:

- [Agents](commands/agents.md)
- [AI models](commands/ai-models.md): the models you can use
- [API keys](commands/api-keys.md)
- [API management](commands/api-management.md): `api-login` and the API URL
- [Apps](commands/apps.md)
- [Automated actions](commands/automated-actions.md): [automations](../../concepts/automations.md)
- [Build](commands/build.md): `build`, `deploy` and the build history
- [Capsules](commands/capsules.md): [sandboxes](../../concepts/capsules.md)
- [Code pipelines](commands/code-pipelines.md)
- [Config](commands/config.md): `config-get`
- [Connectors](commands/connectors.md)
- [Credentials](commands/credentials.md): model credentials and credential stacks
- [External operations](commands/external-operations.md): [tools](../../concepts/tools.md), which are known as
  external operations (extops) in Maitento
- [File system](commands/file-system.md): `cd`, `ls`, `cat`, `cp` and the rest
- [Files](commands/files.md): the files in knowledge bases
- [Getting started](commands/getting-started.md): `init` and `doctor`
- [Interactions](commands/interactions.md)
- [Looms](commands/looms.md): [memory](../../concepts/memory.md)
- [Namespaces](commands/namespaces.md): including `ns-set` and `ns-get`
- [Notifications](commands/notifications.md): live events
- [Partitions](commands/partitions.md): [knowledge bases](../../concepts/knowledge.md)
- [Processes](commands/processes.md): runs of every kind
- [Secrets](commands/secrets.md)
- [Usage](commands/usage.md)
- [Verbose logging](commands/verbose-logging.md)
- [Virtual file systems](commands/virtual-file-systems.md): create, list and sync [file systems](../../concepts/file-systems.md)
- [Web access](commands/web-access.md): where [web tools](../../concepts/web-tools.md) keep the pages they read
- [Web hooks](commands/web-hooks.md)
- [Shell](commands/shell.md): `help`. The interactive shell and the cloud shell also take `clear` and `exit`.
