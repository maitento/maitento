---
title: The shell
description: mt is Maitento's command line. It's one program you can run in your terminal, as an interactive shell, or in the portal's cloud shell.
sidebar:
  order: 20
---

# The shell

The **shell** is `mt`, Maitento's command line. It can do what the SDKs and the portal do: deploy a project, start a
run and follow it to the end, read and write file systems, manage secrets, webhooks and keys. It has more than 200
commands, grouped by area, and `mt help` lists them.

It's one program, and you can run it in three places:

- **In your terminal, one command at a time:** `mt deploy ./maitento`. Each command exits with a code that says
  whether it worked, so scripts and CI jobs can rely on it.
- **As an interactive shell:** `mt` on its own opens a prompt. You type commands without `mt` in front, and `cd`
  around your disk and your file systems.
- **In the portal's cloud shell:** the same shell in your browser, signed in as you. There's nothing to install and no
  key to set.

`mt` is also installed in every [sandbox](capsules.md), signed in as whoever started it.

```bash
mt deploy ./maitento
mt interaction-run hello
```

[Get started](../get-started/5-first-agent.md) runs those two commands. Every tutorial has a **CLI** tab that does the
same with `mt` as the TypeScript, Python and C# tabs do with an SDK: see
[Running the code](../tutorials/index.md#running-the-code).

## When to use it

| Use | For |
|---|---|
| `mt` | deploying from your terminal or a CI job, trying a run by hand, looking around (what's deployed, which runs are live, what's in a file system) and one-off jobs such as adding a secret or a webhook |
| an [SDK](../get-started/4-install.md) | your own application: starting runs from your code, reading their results as typed objects, following [events](runs-and-events.md) |
| the [portal](https://app.maitento.com) | writing and deploying in Build studio, watching runs, settings, keys and billing |

`mt` prints tables for people to read. It has no JSON output, so when a program needs the result, use an SDK.

## Namespaces

Most commands work in one [namespace](index.md#namespaces). `mt` uses the first of these it finds: the command's own
`--namespace`, the `MAITENTO_NAMESPACE` environment variable, or the namespace you saved with `mt ns-set`. In the
cloud shell, it starts in the namespace selected in the portal, and its prompt shows which one you're in.

## File systems

On your computer, `mt` shows your disk and your [file systems](file-systems.md) side by side, as one tree: your disk
under `/local`, and each file system under `/vfs/<name>@<namespace>`. `ls`, `cat`, `cp` and the other file commands
work across both, so `cp` from `/local` to `/vfs` uploads a file. The cloud shell runs on Maitento, not on your
computer, so it sees only `/vfs`. The commands that read or write your disk, such as `deploy` and `vfs-sync`, aren't
available there.

## The three side by side

| | One command at a time | Interactive | Cloud shell |
|---|---|---|---|
| Start it | `mt <command>` | `mt` | the **>_** button in the portal |
| Runs on | your computer | your computer | Maitento |
| Signs in with | your API key, or a saved login | your API key, or a saved login | your portal session |
| Files | `/local` and `/vfs` | `/local` and `/vfs` | `/vfs` |
| Quoting | your own shell's | `mt`'s | `mt`'s |

## Next

- [The mt command line](../reference/cli/index.md): install, sign in, paths, quoting, output, exit codes, scripting
  and the cloud shell, in full.
- [Commands](../reference/cli/commands/index.md): every command's arguments and options.
- [Install the CLI](../get-started/4-install.md) and [create an API key](../get-started/2-api-key.md).
