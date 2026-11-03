# Knowledge, files, memory, the web and sandboxes

None of these is created by a deploy except looms and capsules: knowledge bases and file systems are created through
the API, an SDK or `mt`, and must exist before you deploy anything that names them.

## Knowledge bases

A **knowledge base** is a searchable library of documents: Maitento reads each file, splits it into passages of about
500 tokens and indexes them, so a search finds the right paragraph by meaning as well as by keyword. Agents use it
through a search tool. In the API and `mt` a knowledge base is a **partition**. Concept page:
`docs/concepts/knowledge.md`. Example: `examples/13-your-documents/`.

```bash
mt partition-create handbook
mt file-upload ./knowledge/handbook.md --partition-id <partition id>
mt file-search "how much holiday can I carry over" --partition-id <partition id>
```

- **Indexing needs an embeddings key: OpenAI by default** (DeepSeek doesn't provide embeddings; Gemini and Qwen can be
  chosen per knowledge base). Without one, each file's `indexingFailure` says so and a search is refused with
  `api:embeddings:fallback-not-permitted`.
- A file is searchable once `isVectorGenerated` is `true`, a few seconds per document. PDFs (OCR for scans), Word,
  Excel, PowerPoint, HTML, Markdown, text, CSV, JSON and XML, up to 10 MB each.
- **Uploading a changed file adds it beside the old one.** Replace it (`mt file-update`, `files.replace`) or delete
  the old one.
- Managing knowledge bases needs a tenant admin; anyone in the tenant can search one.

**Let an agent search it** with a connector to Maitento's own search endpoint, signed by Maitento, and bind the
knowledge base's id from the run so the model only writes the query:

<!-- snippet: examples/13-your-documents/maitento/connectors/open-api/knowledge-search.mtr -->
```hcl title="connectors/open-api/knowledge-search.mtr"
// Maitento's own search endpoint, the same one the SDK's files.search calls.
// auth = "Maitento": Maitento signs each call for the run, so there's no key to store.
method = "PUT"
url = "https://api.maitento.com/files/embeddings/search"
description = "Searches a knowledge base and returns the closest passages"
schema.request = @json("knowledge-search-request")
auth = "Maitento"
```

The interaction then declares `inputs.functions.binding = [ { function = @ref("search-handbook") name = "partitionId"
target = "partitionId" type = "request" required = true } ]` (see `examples/13-your-documents/maitento/`). If the
tenant's API isn't `https://api.maitento.com`, use that address in the connector's `url`.

## File systems

A **virtual file system** (VFS) is a named folder of files in a namespace, for agents, apps and sandboxes. Concept
page: `docs/concepts/file-systems.md`. Example: `examples/15-files-for-agents/`.

```bash
mt vfs-create notes
mt write /vfs/notes@my-namespace/shopping.md --content "# Shopping"
mt cat /vfs/notes@my-namespace/shopping.md
mt vfs-sync ./my-folder notes
```

- `mt` sees your disk as `/local/...` and a file system as `/vfs/<name>@<namespace>/...`.
- **`vfs-sync` makes the file system an exact copy** of the local folder, deleting what isn't there.
- Writes replace the whole file; the last write wins. Up to about 100 MB per write.
- Agents reach a VFS through tools on Maitento's file API (`auth = "Maitento"`), with the VFS id bound from the run. An
  agent can only do what its tools allow: give it no delete tool and it can't delete.
- Apps use `VfsReadText`, `VfsWriteText`, `VfsFind` and the other `Vfs…` system calls. A capsule or code pipeline
  mounts one at `/mnt/<mountName>`.

## Memory

A **loom** is an agent's long-term memory. Turn it on in the interaction's `loom` block. Concept page:
`docs/concepts/memory.md`. Example: `examples/20-memory/`.

<!-- mtr-properties: InteractionLoom -->
| Setting | What it does |
|---|---|
| `enabled` | `true` turns memory on |
| `scope` | whose memory: `Process` (the default: one run only), `Interaction` (shared by everyone who runs it) or `Input` (one loom per value of an input) |
| `scopeInput` | with `scope = "Input"`, the input that picks the loom, such as `userName` |
| `subjectInputs` | the inputs naming who the memories are about |
| `weave` | who keeps memories: `Suggest` (the default: a weaver offers, the agent decides), `Auto` or `Manual` |
| `recall` | how memories come back to the agent |
| `nightWeaving`, `quietMinutes` | tidy the memory up after a quiet period |

- **`scope` is the setting that matters.** The default, `Process`, remembers nothing across runs. Use `Input` with
  `scopeInput` to give each person their own memory; values are compared exactly (`Ana` and `ana` are two people).
- A named loom shared by several interactions is a file in `looms/` (`docs/reference/project-files/looms.md`).

## Web tools

`allowWebSearch = true` on an agent gives it `WebSearch`; `allowWebFetch = true` gives it `WebFetch` and `WebRead`.
Concept page: `docs/concepts/web-tools.md`. Example: `examples/14-web-research/`.

- **Fetching needs somewhere to keep pages:** a temporary knowledge base named by the run, the namespace or the
  tenant. Without one the start is refused with `api:web:download-partition-required`.
- Every search and page is metered. Private addresses and Maitento's own hosts are refused. Routers don't get web
  tools.

## Capsules (sandboxes)

A **capsule** is the recipe for a short-lived Linux machine: packages to install, users, file systems and secrets to
mount, and startup commands. Concept page: `docs/concepts/capsules.md`. Every property:
`docs/reference/project-files/capsules.md`. Example: `examples/21-sandboxes/`. Your plan must include capsules.

<!-- snippet: examples/21-sandboxes/maitento/capsules/sales-report.mtr -->
```hcl title="capsules/sales-report.mtr"
// A capsule is a short-lived Linux sandbox. This one mounts the sales-data file system,
// runs a Python script on the CSV in it, and stops when the script finishes.
autoTerminate = true
maxDuration = "00:05:00"

// The file system must exist before you deploy: create it and upload the data first.
vfs = [
  {
    vfs = @ref("sales-data")
    mountName = "data"
  }
]

startup = [
  {
    command = "python3"
    arguments = ["/mnt/data/summarise.py"]
    wait = true
    maxDuration = "00:02:00"
  }
]
```

- **Create the file systems and secrets it mounts before you deploy it.** A file system appears at
  `/mnt/<mountName>`, a secret as the file `/mnt/secrets/<mountName>`; both belong to the default user.
- Output from startup commands isn't kept: write results to a mounted file system.
- Each argument reaches the program as one word, exactly as given: no shell expansion.
- `maxDuration` is 10 minutes unless set. A capsule without `autoTerminate` stays up and takes commands
  (`mt capsule-exec`, `CapsuleExec` in an app).
