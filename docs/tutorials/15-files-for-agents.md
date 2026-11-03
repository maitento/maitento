---
title: 15. Files for agents
description: An agent that keeps your notes in a virtual file system, reading and rewriting them as you ask.
sidebar:
  order: 15
---

# 15. Files for agents

Build a note keeper: ask it to add things to your lists, and it reads the right file, changes it and saves it. A
knowledge base, from tutorial 13, is for searching many documents. A **file system** is for files an agent reads and
writes whole: notes, drafts, data.

> **You'll learn**
>
> - how to make a virtual file system and put files in it from your code
> - how to give an agent tools to list, read and write those files
> - how one run input can feed several tools
> - why an agent can only do what its tools allow
>
> **New concepts:** [virtual file systems](../concepts/file-systems.md)
>
> **Builds on:** [13. Your documents](13-your-documents.md) (tools that call Maitento's own API, and a run input
> bound to a tool)
>
> **Time:** ~10 min · **Cost:** under $0.01 on DeepSeek · **Needs:** nothing beyond Get started

## 1. Make a file system

A **virtual file system** (VFS) is a folder tree that lives in Maitento. It belongs to a namespace, and its files
stay until you delete them. Nothing is indexed: files are read and written whole, by their path. Later tutorials use
the same file systems from [apps](16-apps.md), [sandboxes](21-sandboxes.md) and
[code pipelines](22-code-pipelines.md).

This script makes one called `notes`, with a shopping list in it:

<!-- tabs -->
<!-- snippet: examples/15-files-for-agents/typescript/setup.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();

// A virtual file system for the notes. It lives in your namespace, and its files stay until you delete them.
const notes = (await mt.vfs.findByName("notes")) ?? (await mt.vfs.create({ name: "notes" }));

// Start from a fresh shopping list each time you run this.
const files = mt.vfs.open("notes");
await files.writeText("/shopping.md", "# Shopping\n\n- milk\n- bread\n");

console.log(await files.readText("/shopping.md"));
console.log(`The notes file system is ready. Its id: ${notes.id}`);
```
<!-- /snippet -->
<!-- snippet: examples/15-files-for-agents/python/setup.py -->
```python title="Python"
from maitento import Maitento

mt = Maitento()

# A virtual file system for the notes. It lives in your namespace, and its files stay until you delete them.
notes = mt.vfs.find_by_name("notes") or mt.vfs.create("notes")

# Start from a fresh shopping list each time you run this.
files = mt.vfs.open("notes")
files.write_text("/shopping.md", "# Shopping\n\n- milk\n- bread\n")

print(files.read_text("/shopping.md"))
print(f"The notes file system is ready. Its id: {notes.id}")
```
<!-- /snippet -->
<!-- snippet: examples/15-files-for-agents/csharp/setup.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();

// A virtual file system for the notes. It lives in your namespace, and its files stay until you delete them.
var ns = mt.DefaultNamespace!;
var notes = await mt.VirtualFileSystems.GetByNameAsync(ns, "notes")
    ?? await mt.VirtualFileSystems.CreateAsync(ns, "notes");

// Start from a fresh shopping list each time you run this.
await mt.VirtualFileSystems.WriteTextById(notes.Id, "/shopping.md", "# Shopping\n\n- milk\n- bread\n");

Console.WriteLine(await mt.VirtualFileSystems.ReadTextById(notes.Id, "/shopping.md"));
Console.WriteLine($"The notes file system is ready. Its id: {notes.Id}");
```
<!-- /snippet -->
```bash title="CLI"
mt vfs-create notes
mt write /vfs/notes@tutorials/shopping.md --content "# Shopping"
mt cat /vfs/notes@tutorials/shopping.md
```
<!-- /tabs -->

```text
# Shopping

- milk
- bread

The notes file system is ready. Its id: c37015da-ceb7-4764-9027-37e80ad5d7ae
```

In the portal, open **File systems**, then `notes`, to see the file.

**Done when:** the script prints the shopping list and the file system's id.

## 2. Give the agent file tools

The agent works on the notes through three tools. They follow the pattern from tutorial 13: each connector calls
Maitento's own file API, with `auth = "Maitento"` ([what that does](13-your-documents.md#what-auth--maitento-does)).

| Tool | Calls | So the agent can |
|---|---|---|
| `list-notes` | `GET /vfs/by-id/{id}/directories/contents` | see which notes exist |
| `read-note` | `GET /vfs/by-id/{id}/files/contents/text` | read one |
| `write-note` | `PUT /vfs/by-id/{id}/files/write/text` | save one, replacing what was there |

This is the write connector. The model fills in the `path` and the request body, which holds the new content:

<!-- snippet: examples/15-files-for-agents/maitento/connectors/open-api/vfs-write.mtr -->
```hcl title="maitento/connectors/open-api/vfs-write.mtr"
method = "PUT"
url = "https://api.maitento.com/vfs/by-id/{id}/files/write/text"
description = "Writes a text file to a virtual file system, replacing it if it exists"
auth = "Maitento"
schema.request = @json("vfs-write-request")
parameters.path = [
  {
    name = "id"
    description = "The virtual file system id"
  }
]
parameters.query = [
  {
    name = "path"
    description = "The file to write, for example /shopping.md"
  }
]
```
<!-- /snippet -->

Every connector needs the file system's `{id}`. As in tutorial 13, the run supplies it and the model never sees it,
but this time one run input, `notesVfsId`, feeds all three tools. Each binding has `type = "path"`, because the id is
a path parameter:

<!-- snippet: examples/15-files-for-agents/maitento/interactions/one-shot/notes.mtr -->
```hcl title="maitento/interactions/one-shot/notes.mtr"
agent = {
  name = "NoteKeeper"
  agent = @ref("note-keeper")
}
task = "%%request%%"
inputs.prompts = [
  {
    name = "request"
    description = "What to do with the notes"
    required = true
  }
]
functions.openApi = [
  {
    name = "list-notes"
    ref = @ref("list-notes")
  },
  {
    name = "read-note"
    ref = @ref("read-note")
  },
  {
    name = "write-note"
    ref = @ref("write-note")
  }
]
// One run input, notesVfsId, fills the {id} of all three tools.
inputs.functions.binding = [
  {
    function = @ref("list-notes")
    name = "notesVfsId"
    target = "id"
    description = "The virtual file system that holds the notes"
    required = true
    type = "path"
  },
  {
    function = @ref("read-note")
    name = "notesVfsId"
    target = "id"
    description = "The virtual file system that holds the notes"
    required = true
    type = "path"
  },
  {
    function = @ref("write-note")
    name = "notesVfsId"
    target = "id"
    description = "The virtual file system that holds the notes"
    required = true
    type = "path"
  }
]
```
<!-- /snippet -->

Now deploy it and ask for a change:

<!-- tabs -->
<!-- snippet: examples/15-files-for-agents/typescript/notes.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

const notes = await mt.vfs.findByName("notes");
if (!notes) throw new Error("Run setup.ts first.");

const request = process.argv[2] ?? "Add eggs and coffee to my shopping list, then tell me what is on it.";

// notesVfsId fills in the file system's id for all three tools. The model never sees it.
const run = await mt.interactions.run("notes", { inputs: { request, notesVfsId: notes.id } });
console.log(run.output);

console.log("\nWhat the agent did:");
for (const call of run.context.toolCall) console.log(`- ${call.functionName} ${call.argumentsJson}`);

console.log("\nThe file now says:\n" + (await mt.vfs.open("notes").readText("/shopping.md")));
```
<!-- /snippet -->
<!-- snippet: examples/15-files-for-agents/python/notes.py -->
```python title="Python"
import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

notes = mt.vfs.find_by_name("notes")
if notes is None:
    sys.exit("Run setup.py first.")

request = sys.argv[1] if len(sys.argv) > 1 else "Add eggs and coffee to my shopping list, then tell me what is on it."

# notesVfsId fills in the file system's id for all three tools. The model never sees it.
run = mt.interactions.run("notes", inputs={"request": request, "notesVfsId": notes.id})
print(run.output)

print("\nWhat the agent did:")
for call in run.context.tool_call:
    print(f"- {call.function_name} {call.arguments_json}")

print("\nThe file now says:\n" + mt.vfs.open("notes").read_text("/shopping.md"))
```
<!-- /snippet -->
<!-- snippet: examples/15-files-for-agents/csharp/notes.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

var notes = await mt.VirtualFileSystems.GetByNameAsync(mt.DefaultNamespace!, "notes")
    ?? throw new InvalidOperationException("Run setup.cs first.");

var request = args.Length > 0 ? args[0] : "Add eggs and coffee to my shopping list, then tell me what is on it.";

// notesVfsId fills in the file system's id for all three tools. The model never sees it.
var run = await mt.Interactions.RunAsync("notes", new Dictionary<string, string>
{
    ["request"] = request,
    ["notesVfsId"] = notes.Id.ToString(),
});
Console.WriteLine(run.Output);

Console.WriteLine("\nWhat the agent did:");
foreach (var call in run.Context.ToolCall) Console.WriteLine($"- {call.FunctionName} {call.ArgumentsJson}");

Console.WriteLine("\nThe file now says:\n" + await mt.VirtualFileSystems.ReadTextById(notes.Id, "/shopping.md"));
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt interaction-run notes --input-request "Add eggs and coffee to my shopping list" --input-notesvfsid <id>
mt cat /vfs/notes@tutorials/shopping.md
```
<!-- /tabs -->

```text
I have added eggs and coffee to your shopping list. It now contains:

- milk
- bread
- eggs
- coffee

What the agent did:
- list-notes {"additionalInputs":{"query.path":"/"}}
- read-note {"additionalInputs":{"query.path":"/shopping.md"}}
- write-note {"additionalInputs":{"query.path":"/shopping.md"},"request":{"content":"# Shopping\n\n- milk\n- bread\n- eggs\n- coffee\n"}}

The file now says:
# Shopping

- milk
- bread
- eggs
- coffee
```

The agent listed the notes, read `shopping.md`, and wrote it back with the new items. A write replaces the whole
file, so it has to read first, or it would lose milk and bread. Its prompt, in `agents/note-keeper.mtr`, tells it so.
None of its calls carries the file system's id: Maitento added it from `notesVfsId`.

**Done when:** the file ends with eggs and coffee, under milk and bread.

## All the files

<!-- project: examples/15-files-for-agents -->
**On GitHub:** [`examples/15-files-for-agents`](https://github.com/maitento/maitento/tree/main/examples/15-files-for-agents) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/15-files-for-agents/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/15-files-for-agents/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/15-files-for-agents/csharp)

<details>
<summary>All the files in this project (9)</summary>

<!-- tabs: files -->
**`maitento/agents/note-keeper.mtr`**
```hcl title="maitento/agents/note-keeper.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You keep the user's notes. Before you change a note, read it, so you never lose what is already there."
summary = "Keeps notes in a file system"
```

**`maitento/connectors/open-api/vfs-list.mtr`**
```hcl title="maitento/connectors/open-api/vfs-list.mtr"
// Three connectors to Maitento's own file system (VFS) API. auth = "Maitento" means
// Maitento signs each call for the run, so no credential goes in these files.
method = "GET"
url = "https://api.maitento.com/vfs/by-id/{id}/directories/contents"
description = "Lists the files and folders in a folder of a virtual file system"
auth = "Maitento"
parameters.path = [
  {
    name = "id"
    description = "The virtual file system id"
  }
]
parameters.query = [
  {
    name = "path"
    description = "The folder to list, for example /"
  }
]
```

**`maitento/connectors/open-api/vfs-read.mtr`**
```hcl title="maitento/connectors/open-api/vfs-read.mtr"
method = "GET"
url = "https://api.maitento.com/vfs/by-id/{id}/files/contents/text"
description = "Reads a text file from a virtual file system"
auth = "Maitento"
parameters.path = [
  {
    name = "id"
    description = "The virtual file system id"
  }
]
parameters.query = [
  {
    name = "path"
    description = "The file to read, for example /shopping.md"
  }
]
```

**`maitento/connectors/open-api/vfs-write.mtr`**
```hcl title="maitento/connectors/open-api/vfs-write.mtr"
method = "PUT"
url = "https://api.maitento.com/vfs/by-id/{id}/files/write/text"
description = "Writes a text file to a virtual file system, replacing it if it exists"
auth = "Maitento"
schema.request = @json("vfs-write-request")
parameters.path = [
  {
    name = "id"
    description = "The virtual file system id"
  }
]
parameters.query = [
  {
    name = "path"
    description = "The file to write, for example /shopping.md"
  }
]
```

**`maitento/external-operations/open-api/list-notes.mtr`**
```hcl title="maitento/external-operations/open-api/list-notes.mtr"
connector = @ref("vfs-list")
guidance = "Lists the notes that exist. Use path / to see them all."
```

**`maitento/external-operations/open-api/read-note.mtr`**
```hcl title="maitento/external-operations/open-api/read-note.mtr"
connector = @ref("vfs-read")
guidance = "Reads one note."
```

**`maitento/external-operations/open-api/write-note.mtr`**
```hcl title="maitento/external-operations/open-api/write-note.mtr"
connector = @ref("vfs-write")
guidance = "Creates or replaces one note. Notes are Markdown files in the root folder, named like /shopping.md."
```

**`maitento/interactions/one-shot/notes.mtr`**
```hcl title="maitento/interactions/one-shot/notes.mtr"
agent = {
  name = "NoteKeeper"
  agent = @ref("note-keeper")
}
task = "%%request%%"
inputs.prompts = [
  {
    name = "request"
    description = "What to do with the notes"
    required = true
  }
]
functions.openApi = [
  {
    name = "list-notes"
    ref = @ref("list-notes")
  },
  {
    name = "read-note"
    ref = @ref("read-note")
  },
  {
    name = "write-note"
    ref = @ref("write-note")
  }
]
// One run input, notesVfsId, fills the {id} of all three tools.
inputs.functions.binding = [
  {
    function = @ref("list-notes")
    name = "notesVfsId"
    target = "id"
    description = "The virtual file system that holds the notes"
    required = true
    type = "path"
  },
  {
    function = @ref("read-note")
    name = "notesVfsId"
    target = "id"
    description = "The virtual file system that holds the notes"
    required = true
    type = "path"
  },
  {
    function = @ref("write-note")
    name = "notesVfsId"
    target = "id"
    description = "The virtual file system that holds the notes"
    required = true
    type = "path"
  }
]
```

**`maitento/json/vfs-write-request.json`**
```json title="maitento/json/vfs-write-request.json"
{
  "type": "object",
  "properties": {
    "content": { "type": "string", "description": "The whole new content of the file" }
  },
  "required": ["content"],
  "additionalProperties": false
}
```
<!-- /tabs -->

</details>

<!-- /project -->

## Break it on purpose

Ask for something its tools can't do:

<!-- tabs -->
```bash title="TypeScript"
node setup.ts
node notes.ts "Delete my shopping list."
```
```bash title="Python"
python setup.py
python notes.py "Delete my shopping list."
```
```bash title="C#"
dotnet run setup.cs
dotnet run notes.cs "Delete my shopping list."
```
<!-- /tabs -->

```text
I've read your shopping list; it currently contains milk and bread.

However, I'm not able to delete notes — I can only read and write (create or replace) them. I don't want to
overwrite the file with empty content, as that would destroy the list irreversibly rather than delete it. …

What the agent did:
- list-notes {"additionalInputs":{"query.path":"/"}}
- read-note {"additionalInputs":{"query.path":"/shopping.md"}}
```

An agent can only do what its tools let it do. There's no delete tool, so the file is still there. That's how you
keep an agent's reach small: give it the tools the job needs, and no more.

The file system also keeps an agent inside it. A path can't climb out of it: `/../../outside.md` is just
`/outside.md`, in the same file system.

## If it didn't work

- **The run won't start: "requires input for notesVfsId".** The binding makes `notesVfsId` a required run input.
  Pass the file system's id, as the scripts do.
- **`Run setup.ts first.`** The file system is created in your namespace (`MAITENTO_NAMESPACE`). Run `setup` in the
  same namespace as `notes`.
- **The agent says it couldn't read or save the note.** A tool call failed. Open the run in the portal's **Runs** to
  see the error. If your tenant uses an address other than `https://api.maitento.com`, put that in each connector's
  `url`.
- **Items disappear from the list.** Two writes at once: the last write wins, and there's no locking. Don't run two
  requests on the same note at the same time.

## Review

You built:

- a file system with a shopping list in it, made from your code;
- a note keeper with three tools on Maitento's own file API, all fed the file system's id by one run input;
- a request it can't carry out, because no tool does that.

The concepts:

- [Virtual file system](../concepts/file-systems.md): a folder tree in a namespace. Files are read and written whole,
  by path, and stay until you delete them.
- One run input, several tools: `notesVfsId` fills the `{id}` of every tool (`type = "path"`), so the model never
  handles it.

**Challenge:** give the note keeper a `delete-note` tool, and ask it to delete a note. You'll need a connector to
`DELETE /vfs/by-id/{id}/files?path=…`, a tool for it, and an interaction that binds `notesVfsId` to it too. The
solution is in [`examples/15-files-for-agents/solution`](../../examples/15-files-for-agents/solution/). It adds just
those files and deploys them on top of the tutorial's project, under a new interaction name so `notes` stays as it
was.

**Next:** [16. Apps](16-apps.md) puts your own logic around your agents.
