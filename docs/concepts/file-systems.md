---
title: File systems
description: Virtual file systems hold files that agents, apps, capsules and coding agents can read and write.
sidebar:
  order: 10
---

# File systems

A **virtual file system** (VFS) is a named folder tree that lives in Maitento, inside a namespace. You fill it from
your machine or from code, and then:

- [capsules](capsules.md) and [code pipelines](code-pipelines.md) see it as an ordinary directory;
- [apps](apps.md) read and write it directly;
- agents in interactions read and write it through tools.

Files stay until you delete them. Nothing is indexed: files are read and written whole, by their path. For searching
many documents, use a [knowledge base](knowledge.md) instead.

See it in [tutorial 15, Files for agents](../tutorials/15-files-for-agents.md), a note keeper that reads and rewrites
your lists, and [tutorial 21, Sandboxes](../tutorials/21-sandboxes.md), where a capsule finds the same kind of file
system mounted at `/mnt/data`.

## Create one and add files

<!-- tabs -->
```ts
const notes = await mt.vfs.create({ name: "notes" });
const files = mt.vfs.open("notes");
await files.writeText("/shopping.md", "# Shopping\n\n- milk\n- bread\n");
console.log(await files.readText("/shopping.md"));
```
```python
notes = mt.vfs.create(name="notes")
files = mt.vfs.open("notes")
files.write_text("/shopping.md", "# Shopping\n\n- milk\n- bread\n")
print(files.read_text("/shopping.md"))
```
```csharp
var notes = await mt.VirtualFileSystems.CreateAsync(mt.DefaultNamespace!, "notes");
await mt.VirtualFileSystems.WriteTextById(notes.Id, "/shopping.md", "# Shopping\n\n- milk\n- bread\n");
Console.WriteLine(await mt.VirtualFileSystems.ReadTextById(notes.Id, "/shopping.md"));
```
```bash
mt vfs-create notes
mt write /vfs/notes@hello-maitento/shopping.md --content "# Shopping"
mt cat /vfs/notes@hello-maitento/shopping.md
mt vfs-sync ./my-folder notes        # copy a whole local folder up
```
<!-- /tabs -->

Create the namespace first if nothing has been deployed to it yet. A VFS can't be created in a namespace that
doesn't exist.

## The `mt` shell's view

The `mt` command line shows your disk and your file systems side by side:

| Path | Is |
|---|---|
| `/local/...` | your own disk (on Windows, `/local/c/...` is `C:\...`) |
| `/vfs/<name>@<namespace>/...` | a virtual file system |

So `mt cp /local/c/data/report.csv /vfs/notes@hello-maitento/report.csv` uploads a file, and `ls`, `cat`, `mkdir`,
`rm` and `mv` work across both. `find` and `tree` work on file systems only. See
[file paths](../reference/cli/index.md) in the `mt` reference.

`vfs-sync` makes the VFS an **exact copy** of the local folder, including deleting files that aren't in it.

## Giving agents files

Agents reach a VFS through tools that call Maitento's own file API, with `auth = "Maitento"`.
[Tutorial 15](../tutorials/15-files-for-agents.md) builds a note keeper with list, read and write tools, all bound
to one run input that carries the VFS id ([values from the run](tools.md#values-from-the-run-not-the-model)), so the
model never handles it.

An agent can only do what its tools allow. With no delete tool, it can't delete a file, however it's asked: give it
the tools the job needs, and no more.

## Good to know

- **Writes replace.** Writing a file replaces it; there is no locking, so the last write wins.
- **Paths can't leave the file system.** Every path is taken from its root, so `/../../notes.md` is `/notes.md`.
- **Files can be large**, up to about 100 MB per write.
- **A mounted VFS can't be deleted** until the capsule or pipeline using it ends.
