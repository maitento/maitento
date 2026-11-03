---
title: Knowledge
description: Upload documents to a knowledge base and let agents answer from them (retrieval-augmented generation).
sidebar:
  order: 9
---

# Knowledge

A **knowledge base** is a searchable library of your documents. Upload a file and Maitento reads it, splits it into
passages and indexes them, so a search for "carry over holiday" finds the paragraph about unused leave even if it
never uses those words. Agents use it through a search tool and answer from what they find. This pattern is often
called *retrieval-augmented generation*, or RAG.

In the API and the CLI a knowledge base is called a **partition**.

See it in [tutorial 13, Your documents](../tutorials/13-your-documents.md), which puts a staff handbook in a
knowledge base and gives an agent a tool to answer from it.

## Create one and upload documents

<!-- tabs -->
```ts
const handbook = await mt.partitions.create({ name: "handbook" });
await mt.files.upload(handbook.id, "./knowledge/handbook.md");
```
```python
handbook = mt.partitions.create(name="handbook")
mt.files.upload(handbook.id, "./knowledge/handbook.md")
```
```csharp
var handbook = await mt.Partitions.CreateAsync("handbook");
var bytes = await File.ReadAllBytesAsync("./knowledge/handbook.md");
await mt.Files.IngestFileAsync(handbook.Id, bytes, "handbook.md", "text/markdown");
```
```bash
mt partition-create handbook
mt file-upload ./knowledge/handbook.md --partition-id <partition id>
```
<!-- /tabs -->

Maitento reads PDFs, Word, Excel and PowerPoint files, HTML, Markdown, text, CSV, JSON and XML. Scanned PDFs are
read with OCR and images are described in words. One file can be up to 10 MB. Uploading the same file twice keeps one
copy.

Indexing takes a few seconds per document. A file is searchable once `isVectorGenerated` is `true`. A file that
can't be indexed until you act says why in its `indexingFailure`: a `code`, such as
`api:embeddings:fallback-not-permitted` when there is no embedding key, and a `message` that says what to do. Once you
fix it the file is indexed and `indexingFailure` is cleared.

When a knowledge base has no embedding key it may use at all, its files wait rather than being retried. Adding a
model key, giving the knowledge base keys or a credential stack, or consenting to Maitento's own key starts them again
within a minute or so. Maitento also checks a waiting knowledge base every 15 minutes, so a fix made any other way is
picked up too. While its files wait, the knowledge base carries one `embeddingCredentialFailures` entry with
`failureReason` `IndexingDisabled` (and `credentialId` `maitento-fallback`), which you can read to tell your admins.

## Search it

<!-- tabs -->
```ts
const hits = await mt.files.search({ partitionId: handbook.id, query: "how much holiday can I carry over" });
```
```python
hits = mt.files.search(partition_id=handbook.id, query="how much holiday can I carry over")
```
```csharp
var hits = await mt.Files.SearchEmbeddingsAsync(handbook.Id, "how much holiday can I carry over");
```
```bash
mt file-search "how much holiday can I carry over" --partition-id <partition id>
```
<!-- /tabs -->

Search combines meaning-based and keyword matching and returns the best passages, each with the file it came from.

## Let an agent search it

Give the agent a tool that calls Maitento's own search endpoint. `auth = "Maitento"` means Maitento signs the call
itself, so no credential goes in your files:

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
<!-- /snippet -->

The interaction then binds the knowledge base's id from a run input
([values from the run](tools.md#values-from-the-run-not-the-model)), so the model only ever writes the search query.
See the full example in [tutorial 13](../tutorials/13-your-documents.md#3-give-an-agent-a-search-tool).

## Good to know

- **It needs an embeddings provider.** Indexing turns text into vectors with OpenAI by default, so add an **OpenAI**
  [model key](models-and-keys.md) (DeepSeek doesn't provide embeddings). Without one, files aren't indexed (their
  `indexingFailure` says so), and a search is refused with `api:embeddings:fallback-not-permitted`, not answered with
  nothing. Gemini and Qwen can be chosen per knowledge base instead.
- **A knowledge base can be paid for by its own account.** Give it a
  [credential stack](credentials.md#work-that-isnt-a-run) of its own, such as one customer's, and it embeds on that
  stack instead of your model keys.
- **Managing knowledge bases needs a tenant admin** (or the file-ingestion role): creating, listing and reading
  them, and uploading files. Everyone in the tenant can search them.
- **A document is split into passages** of about 500 tokens, a few hundred words, and each passage is indexed on its
  own. A short document is one passage, so a search can only return it whole.
- **Search always returns the closest passages**, even when none of them answers the question. An agent with a search
  tool has to judge whether what came back answers it, which is why its instructions should say what to do when the
  knowledge base doesn't cover something ([tutorial 13](../tutorials/13-your-documents.md#break-it-on-purpose)).
- **Uploading a changed file again adds it beside the old one.** Delete the old file if the new one replaces it.
- **A knowledge base is deleted only once it is empty.** Delete its files first.
- **Knowledge bases belong to the whole tenant** and are referred to by id.
- **Temporary knowledge bases** (`isTemporary`) forget their files after `fileLifetimeHours`. [Web tools](web-tools.md)
  use one for downloads.
