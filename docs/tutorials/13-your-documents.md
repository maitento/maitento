---
title: 13. Your documents
description: Put your documents in a knowledge base, search it, and give an agent a tool that answers from it.
sidebar:
  order: 13
---

# 13. Your documents

Build an assistant that answers employees' questions from the company handbook, and quotes it. A model knows a lot,
but not your documents. A **knowledge base** gives it your own text to answer from, so it quotes your rules instead
of guessing. This pattern is often called retrieval-augmented generation, or RAG.

> **You'll learn**
>
> - how to put documents in a knowledge base, and how indexing makes them searchable
> - how to search a knowledge base from your code
> - how to give an agent a search tool that calls Maitento's own API
> - why the knowledge base's id comes from the run, not the model
>
> **New concepts:** [knowledge bases](../concepts/knowledge.md) (partitions) · embeddings ·
> [`auth = "Maitento"`](../concepts/tools.md#when-the-agent-calls-your-server) ·
> [run inputs bound to a tool](../concepts/tools.md#values-from-the-run-not-the-model)
>
> **Builds on:** [8. Your first tool](08-first-tool.md) and [9. Call your code](09-call-your-code.md)
>
> **Time:** ~15 min · **Cost:** under $0.01 on DeepSeek, plus a fraction of a cent on OpenAI for indexing ·
> **Needs:** an **OpenAI** [model key](../concepts/models-and-keys.md) as well as DeepSeek (DeepSeek doesn't make
> embeddings), and a tenant admin's API key (only admins can create knowledge bases)

## 1. Put the handbook in a knowledge base

The handbook is four short Markdown files in `knowledge/`: holidays, working from home, expenses and sick leave.

A **knowledge base** is a searchable set of documents. Maitento's API and CLI call it a **partition**, so that's
the word you'll see in code. A knowledge base belongs to your whole tenant, not to one namespace.

This script creates one called `handbook` and uploads the four files:

<!-- tabs -->
<!-- snippet: examples/13-your-documents/typescript/setup.ts -->
```ts title="TypeScript"
import { readdirSync } from "node:fs";
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();

// A knowledge base for the handbook. Maitento's API calls a knowledge base a partition.
const partitions = await mt.partitions.list();
const handbook = partitions.find((p) => p.name === "handbook" && !p.isTemporary)
  ?? (await mt.partitions.create({ name: "handbook" }));

// Upload each document. Maitento reads its text. Uploading the same file again keeps one copy.
for (const name of readdirSync("../knowledge")) {
  await mt.files.upload(handbook.id, `../knowledge/${name}`);
  console.log(`Uploaded ${name}`);
}

// Indexing turns each document into embeddings, in the background. Wait until every file can be searched.
for (let attempt = 1; ; attempt++) {
  const files = [];
  for await (const file of mt.partitions.files(handbook.id)) files.push(file);
  const waiting = files.filter((f) => !f.isVectorGenerated).length;
  if (files.length > 0 && waiting === 0) break;
  if (attempt === 30) {
    // A file that can't be indexed until you act says why.
    const why = files.find((f) => f.indexingFailure)?.indexingFailure?.message ?? "Indexing needs an OpenAI model key.";
    throw new Error(`${waiting} files are still not indexed after a minute. ${why}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
console.log(`The handbook is indexed. Knowledge base id: ${handbook.id}`);
```
<!-- /snippet -->
<!-- snippet: examples/13-your-documents/python/setup.py -->
```python title="Python"
import os
import sys
import time

from maitento import Maitento

mt = Maitento()

# A knowledge base for the handbook. Maitento's API calls a knowledge base a partition.
partitions = mt.partitions.list()
handbook = next((p for p in partitions if p.name == "handbook" and not p.is_temporary), None)
if handbook is None:
    handbook = mt.partitions.create("handbook")

# Upload each document. Maitento reads its text. Uploading the same file again keeps one copy.
for name in sorted(os.listdir("../knowledge")):
    mt.files.upload(handbook.id, f"../knowledge/{name}")
    print(f"Uploaded {name}")

# Indexing turns each document into embeddings, in the background. Wait until every file can be searched.
for attempt in range(1, 31):
    files = list(mt.partitions.files(handbook.id))
    waiting = len([f for f in files if not f.is_vector_generated])
    if files and waiting == 0:
        break
    if attempt == 30:
        # A file that can't be indexed until you act says why.
        failure = next((f.indexing_failure for f in files if f.indexing_failure), None)
        why = failure.message if failure else "Indexing needs an OpenAI model key."
        sys.exit(f"{waiting} files are still not indexed after a minute. {why}")
    time.sleep(2)
print(f"The handbook is indexed. Knowledge base id: {handbook.id}")
```
<!-- /snippet -->
<!-- snippet: examples/13-your-documents/csharp/setup.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();

// A knowledge base for the handbook. Maitento's API calls a knowledge base a partition.
var partitions = await mt.Partitions.GetAllAsync();
var handbook = partitions.FirstOrDefault(p => p.Name == "handbook" && !p.IsTemporary)
    ?? await mt.Partitions.CreateAsync("handbook");

// Upload each document. Maitento reads its text. Uploading the same file again keeps one copy.
foreach (var path in Directory.GetFiles("../knowledge").Order())
{
    var name = Path.GetFileName(path);
    await mt.Files.IngestFileAsync(handbook.Id, await File.ReadAllBytesAsync(path), name, "text/markdown");
    Console.WriteLine($"Uploaded {name}");
}

// Indexing turns each document into embeddings, in the background. Wait until every file can be searched.
for (var attempt = 1; ; attempt++)
{
    var files = (await mt.Partitions.GetFilesAsync(handbook.Id))?.Items ?? [];
    var waiting = files.Count(f => !f.IsVectorGenerated);
    if (files.Length > 0 && waiting == 0) break;
    if (attempt == 30)
    {
        // A file that can't be indexed until you act says why.
        var why = files.FirstOrDefault(f => f.IndexingFailure != null)?.IndexingFailure!.Message ?? "Indexing needs an OpenAI model key.";
        throw new InvalidOperationException($"{waiting} files are still not indexed after a minute. {why}");
    }
    await Task.Delay(2000);
}
Console.WriteLine($"The handbook is indexed. Knowledge base id: {handbook.Id}");
```
<!-- /snippet -->
```bash title="CLI"
mt partition-create handbook                     # prints the knowledge base's id
mt file-upload knowledge/holidays.md --partition-id <id>
mt file-upload knowledge/working-from-home.md --partition-id <id>
mt file-upload knowledge/expenses.md --partition-id <id>
mt file-upload knowledge/sick-leave.md --partition-id <id>
mt partition-file-list <id>                      # indexed once each file says so
```
<!-- /tabs -->

```text
Uploaded expenses.md
Uploaded holidays.md
Uploaded sick-leave.md
Uploaded working-from-home.md
The handbook is indexed. Knowledge base id: 02a5fe49-28a1-424a-a857-ebc8b5e8b0aa
```

Two things happen to each file:

1. **Upload.** Maitento reads the file and keeps its text. It reads PDF, Word, Excel, PowerPoint, HTML, Markdown,
   text and CSV files, and describes images in words, up to 10 MB a file.
2. **Indexing.** In the background, Maitento turns the text into **embeddings**: lists of numbers that capture what
   the text means, so texts about the same thing get similar numbers. It uses an OpenAI embedding model. A long
   document is cut into passages of about 500 tokens first. These documents are short, so each is one passage.

A file can be searched once its `isVectorGenerated` is `true`, so the script waits for that.

**Done when:** the script prints `The handbook is indexed`. Running it again is safe: uploading the same file again
keeps one copy.

## 2. Search it

Before you give it to an agent, search it yourself:

<!-- tabs -->
<!-- snippet: examples/13-your-documents/typescript/search.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
const handbook = (await mt.partitions.list()).find((p) => p.name === "handbook" && !p.isTemporary);
if (!handbook) throw new Error("Run setup.ts first.");

const query = process.argv[2] ?? "Can I take unused holiday into next year?";
console.log(`Searching for: ${query}\n`);

// The closest match comes first. Each result is a passage, with the name of the file it came from.
const results = await mt.files.search({ partitionId: handbook.id, query });
results.forEach((result, i) => console.log(`${i + 1}. ${result.name}: ${result.text.replace(/\s+/g, " ").slice(0, 70)}…`));
```
<!-- /snippet -->
<!-- snippet: examples/13-your-documents/python/search.py -->
```python title="Python"
import sys

from maitento import Maitento

mt = Maitento()
handbook = next((p for p in mt.partitions.list() if p.name == "handbook" and not p.is_temporary), None)
if handbook is None:
    sys.exit("Run setup.py first.")

query = sys.argv[1] if len(sys.argv) > 1 else "Can I take unused holiday into next year?"
print(f"Searching for: {query}\n")

# The closest match comes first. Each result is a passage, with the name of the file it came from.
results = mt.files.search(handbook.id, query)
for i, result in enumerate(results, start=1):
    print(f"{i}. {result.name}: {' '.join(result.text.split())[:70]}…")
```
<!-- /snippet -->
<!-- snippet: examples/13-your-documents/csharp/search.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using System.Text.RegularExpressions;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
var handbook = (await mt.Partitions.GetAllAsync()).FirstOrDefault(p => p.Name == "handbook" && !p.IsTemporary)
    ?? throw new InvalidOperationException("Run setup.cs first.");

var query = args.Length > 0 ? args[0] : "Can I take unused holiday into next year?";
Console.WriteLine($"Searching for: {query}\n");

// The closest match comes first. Each result is a passage, with the name of the file it came from.
var results = await mt.Files.SearchEmbeddingsAsync(handbook.Id, query);
for (var i = 0; i < results.Length; i++)
{
    var text = Regex.Replace(results[i].Text, @"\s+", " ");
    Console.WriteLine($"{i + 1}. {results[i].Name}: {text[..Math.Min(70, text.Length)]}…");
}
```
<!-- /snippet -->
```bash title="CLI"
mt file-search "Can I take unused holiday into next year?" --partition-id <id>
```
<!-- /tabs -->

```text
Searching for: Can I take unused holiday into next year?

1. holidays.md: # Holidays Everyone gets 25 days of paid holiday a year, plus public h…
2. working-from-home.md: # Working from home You can work from home up to three days a week. Te…
3. sick-leave.md: # Sick leave Tell your manager before 10am on the first day you are of…
4. expenses.md: # Expenses Claim expenses within 60 days, with a receipt, through the …
```

Search compares meaning, using the embeddings, and words, as a keyword search does. It puts the closest passage
first. The question never says "carry over", and it still finds the holiday rules.

Notice that every document came back. Search returns the closest passages, not only the ones that answer the
question. You'll see why that matters when you break it on purpose.

You can also search in the portal: open **Knowledge**, then `handbook`, then the **Search** tab.

**Done when:** `holidays.md` comes first. Then pass a question of your own as the script's first argument, such as
"Who pays for my desk at home?".

## 3. Give an agent a search tool

An agent reaches anything outside the conversation through its tools. Searching a knowledge base is an API call
like any other, so the agent gets an ordinary tool, as in [tutorial 8](08-first-tool.md). Its connector points at
Maitento's own search endpoint, the one `files.search` just called:

<!-- snippet: examples/13-your-documents/maitento/connectors/open-api/knowledge-search.mtr -->
```hcl title="maitento/connectors/open-api/knowledge-search.mtr"
// Maitento's own search endpoint, the same one the SDK's files.search calls.
// auth = "Maitento": Maitento signs each call for the run, so there's no key to store.
method = "PUT"
url = "https://api.maitento.com/files/embeddings/search"
description = "Searches a knowledge base and returns the closest passages"
schema.request = @json("knowledge-search-request")
auth = "Maitento"
```
<!-- /snippet -->

### What `auth = "Maitento"` does

The search endpoint needs credentials, like the orders API in [tutorial 9](09-call-your-code.md). But there's no
secret to create: `auth = "Maitento"` tells Maitento to sign each call itself. For every call, it makes a key that:

- acts as the person who started the run;
- can only reach what tools are allowed to use, such as searching and reading files, never your keys or settings;
- expires after five minutes.

The model never sees that key, and there's nothing for you to store or rotate. Use `auth = "Maitento"` only for
connectors that call Maitento's own API. Their URL is the public API, `https://api.maitento.com`.

### The tool and the agent

The tool (tools are known as external operations, or extops, in Maitento, hence the folder name) tells the model
when to search:

<!-- snippet: examples/13-your-documents/maitento/external-operations/open-api/search-handbook.mtr -->
```hcl title="maitento/external-operations/open-api/search-handbook.mtr"
connector = @ref("knowledge-search")
guidance = "Searches the company handbook. Use it before you answer any question about company policy, and quote what you find."
```
<!-- /snippet -->

The agent answers only from what it finds:

<!-- snippet: examples/13-your-documents/maitento/agents/handbook-assistant.mtr -->
```hcl title="maitento/agents/handbook-assistant.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You answer employees' questions about company policy. Only answer from what the handbook says. If the handbook does not cover it, say so."
summary = "Answers questions from the company handbook"
```
<!-- /snippet -->

### The run picks the knowledge base

The connector's request has two fields, `partitionId` and `query` (in `json/knowledge-search-request.json`). The model
should write the query, but it shouldn't choose the knowledge base. Tutorial 8 fixed a value in the tool itself, with
`bindings`. This value changes from run to run, so the interaction **binds** it to a run input instead:

<!-- snippet: examples/13-your-documents/maitento/interactions/one-shot/ask-handbook.mtr -->
```hcl title="maitento/interactions/one-shot/ask-handbook.mtr"
agent = {
  name = "HandbookAssistant"
  agent = @ref("handbook-assistant")
}
task = "An employee asks: %%question%%"
inputs.prompts = [
  {
    name = "question"
    description = "The employee's question"
    required = true
  }
]
functions.openApi = [
  {
    name = "search-handbook"
    ref = @ref("search-handbook")
  }
]
// A run input, partitionId, goes straight into the tool's request body.
// The model never sees it or chooses it: it only writes the query.
inputs.functions.binding = [
  {
    function = @ref("search-handbook")
    name = "partitionId"
    target = "partitionId"
    description = "The knowledge base to search"
    required = true
    type = "request"
  }
]
```
<!-- /snippet -->

`inputs.functions.binding` adds a run input called `partitionId`, and copies it into the `partitionId` field of the
request (`type = "request"`) on every call to `search-handbook`. Maitento takes the field out of what the model sees.
That means:

- the model can't get a 36-character id wrong, or search a knowledge base it shouldn't;
- the tool's description is shorter, which saves context;
- the same interaction works with any knowledge base. Whoever starts the run decides.

The interaction gives the agent the tool in `functions.openApi`, rather than the agent file doing it, because the
binding belongs to the interaction.

Now deploy the project and ask a question. The script passes the knowledge base's id with the question:

<!-- tabs -->
<!-- snippet: examples/13-your-documents/typescript/ask.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

const handbook = (await mt.partitions.list()).find((p) => p.name === "handbook" && !p.isTemporary);
if (!handbook) throw new Error("Run setup.ts first.");

const question = process.argv[2] ?? "I didn't use all my holiday last year. How much can I carry over, and until when?";

// partitionId goes straight into the search tool's request. The model only writes the query.
const run = await mt.interactions.run("ask-handbook", { inputs: { question, partitionId: handbook.id } });
console.log(run.output);
```
<!-- /snippet -->
<!-- snippet: examples/13-your-documents/python/ask.py -->
```python title="Python"
import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

handbook = next((p for p in mt.partitions.list() if p.name == "handbook" and not p.is_temporary), None)
if handbook is None:
    sys.exit("Run setup.py first.")

question = sys.argv[1] if len(sys.argv) > 1 else (
    "I didn't use all my holiday last year. How much can I carry over, and until when?"
)

# partitionId goes straight into the search tool's request. The model only writes the query.
run = mt.interactions.run("ask-handbook", inputs={"question": question, "partitionId": handbook.id})
print(run.output)
```
<!-- /snippet -->
<!-- snippet: examples/13-your-documents/csharp/ask.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

var handbook = (await mt.Partitions.GetAllAsync()).FirstOrDefault(p => p.Name == "handbook" && !p.IsTemporary)
    ?? throw new InvalidOperationException("Run setup.cs first.");

var question = args.Length > 0
    ? args[0]
    : "I didn't use all my holiday last year. How much can I carry over, and until when?";

// partitionId goes straight into the search tool's request. The model only writes the query.
var run = await mt.Interactions.RunAsync("ask-handbook", new Dictionary<string, string>
{
    ["question"] = question,
    ["partitionId"] = handbook.Id.ToString(),
});
Console.WriteLine(run.Output);
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt interaction-run ask-handbook --input-question "How much holiday can I carry over?" --input-partitionid <id>
```
<!-- /tabs -->

```text
The handbook covers this under **Holidays**:

> "You can carry up to 5 unused days into the next year. They must be used by 31 March, or they are lost."

So you may carry over a maximum of five days, and they must be taken by 31 March — after that date they are
forfeited. For context, the holiday year runs from 1 January to 31 December.
```

What happened:

1. The model saw a `search-handbook` tool with one argument, `query`.
2. It called it with `{"query": "holiday carry over"}`. Maitento added the knowledge base's id from the run, signed
   the call, and sent it to the search endpoint.
3. The search results came back as the tool's result, and the agent quoted the passage that answers the question.

Open the run in the portal's **Runs** to see the tool call and the passages it got back.

**Done when:** the answer quotes the holiday rule: 5 days, used by 31 March.

## All the files

<!-- project: examples/13-your-documents -->
**On GitHub:** [`examples/13-your-documents`](https://github.com/maitento/maitento/tree/main/examples/13-your-documents) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/13-your-documents/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/13-your-documents/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/13-your-documents/csharp)

<details>
<summary>All the files in this project (9)</summary>

<!-- tabs: files -->
**`maitento/agents/handbook-assistant.mtr`**
```hcl title="maitento/agents/handbook-assistant.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You answer employees' questions about company policy. Only answer from what the handbook says. If the handbook does not cover it, say so."
summary = "Answers questions from the company handbook"
```

**`maitento/connectors/open-api/knowledge-search.mtr`**
```hcl title="maitento/connectors/open-api/knowledge-search.mtr"
// Maitento's own search endpoint, the same one the SDK's files.search calls.
// auth = "Maitento": Maitento signs each call for the run, so there's no key to store.
method = "PUT"
url = "https://api.maitento.com/files/embeddings/search"
description = "Searches a knowledge base and returns the closest passages"
schema.request = @json("knowledge-search-request")
auth = "Maitento"
```

**`maitento/external-operations/open-api/search-handbook.mtr`**
```hcl title="maitento/external-operations/open-api/search-handbook.mtr"
connector = @ref("knowledge-search")
guidance = "Searches the company handbook. Use it before you answer any question about company policy, and quote what you find."
```

**`maitento/interactions/one-shot/ask-handbook.mtr`**
```hcl title="maitento/interactions/one-shot/ask-handbook.mtr"
agent = {
  name = "HandbookAssistant"
  agent = @ref("handbook-assistant")
}
task = "An employee asks: %%question%%"
inputs.prompts = [
  {
    name = "question"
    description = "The employee's question"
    required = true
  }
]
functions.openApi = [
  {
    name = "search-handbook"
    ref = @ref("search-handbook")
  }
]
// A run input, partitionId, goes straight into the tool's request body.
// The model never sees it or chooses it: it only writes the query.
inputs.functions.binding = [
  {
    function = @ref("search-handbook")
    name = "partitionId"
    target = "partitionId"
    description = "The knowledge base to search"
    required = true
    type = "request"
  }
]
```

**`maitento/json/knowledge-search-request.json`**
```json title="maitento/json/knowledge-search-request.json"
{
  "type": "object",
  "properties": {
    "partitionId": { "type": "string" },
    "query": { "type": "string", "description": "What to look for, in plain words" }
  },
  "required": ["partitionId", "query"],
  "additionalProperties": false
}
```

**`knowledge/expenses.md`**
```md title="knowledge/expenses.md"
# Expenses

Claim expenses within 60 days, with a receipt, through the finance portal.

Train travel is standard class, unless the journey is longer than three hours.

Meals while travelling are covered up to 40 GBP a day.
```

**`knowledge/holidays.md`**
```md title="knowledge/holidays.md"
# Holidays

Everyone gets 25 days of paid holiday a year, plus public holidays. The holiday year runs from 1 January to
31 December.

You can carry up to 5 unused days into the next year. They must be used by 31 March, or they are lost.

Book holiday at least two weeks ahead for anything longer than three days, and add it to the team calendar.
```

**`knowledge/sick-leave.md`**
```md title="knowledge/sick-leave.md"
# Sick leave

Tell your manager before 10am on the first day you are off sick.

From the eighth day in a row, you need a note from a doctor.
```

**`knowledge/working-from-home.md`**
```md title="knowledge/working-from-home.md"
# Working from home

You can work from home up to three days a week. Tell your team in the team calendar the week before.

Acme pays up to 300 GBP, once, for home-office equipment. Claim it as an expense, with a receipt.
```
<!-- /tabs -->

</details>

<!-- /project -->

## Break it on purpose

Ask something the handbook doesn't cover:

<!-- tabs -->
```bash title="TypeScript"
node search.ts "Can I bring my dog to the office?"
node ask.ts "Can I bring my dog to the office?"
```
```bash title="Python"
python search.py "Can I bring my dog to the office?"
python ask.py "Can I bring my dog to the office?"
```
```bash title="C#"
dotnet run search.cs "Can I bring my dog to the office?"
dotnet run ask.cs "Can I bring my dog to the office?"
```
<!-- /tabs -->

```text
Searching for: Can I bring my dog to the office?

1. working-from-home.md: # Working from home You can work from home up to three days a week. Te…
2. holidays.md: # Holidays Everyone gets 25 days of paid holiday a year, plus public h…
3. sick-leave.md: # Sick leave Tell your manager before 10am on the first day you are of…
4. expenses.md: # Expenses Claim expenses within 60 days, with a receipt, through the …

The employee handbook does not cover bringing pets or dogs into the office. I searched for policy on pets, animals
and workplace visitors, and the only related results were the working-from-home, holidays, sick leave and expenses
sections, none of which address this. …
```

Search still returned four passages: the closest ones, even though none of them answers. Search never says "nothing
relevant". It's the agent that decides the passages don't help. Its prompt asks it to answer only from the handbook,
and to say so when the handbook doesn't cover something. Put both of those in the prompts of your own agents.

## If it didn't work

- **`setup` stops with "files are still not indexed" and says there is no embedding key.** Indexing needs an
  **OpenAI** model key. Without one, each file's `indexingFailure` says so (code `api:embeddings:fallback-not-permitted`),
  and a search of the handbook is refused with the same code, so the agent says it couldn't search. Add an OpenAI key
  in the portal's **Settings → Model keys** ([3. Add a model key](../get-started/3-model-key.md)). The files wait
  until there's a key, and adding one starts them again, so they're indexed within a few minutes: then run `setup`
  again.
- **Listing or creating the knowledge base fails with a 403.** Only tenant admins can list and create knowledge
  bases, and upload files. Anyone in the tenant can search one, given its id. Use an admin's API key.
- **The agent says it couldn't search the handbook.** Its tool call failed. Open the run in **Runs** to see the
  tool's error. If your tenant uses an address other than `https://api.maitento.com`, put that in the connector's
  `url`.
- **The answer quotes an old rule after you changed a document.** Uploading a changed file adds it next to the old
  one, so both are searched. Replace the file instead (`files.replace` with the file's id, or `mt file-update`), or
  delete the old one.

## Review

You built:

- a knowledge base of four policy documents, uploaded and indexed;
- a script that searches it, best match first;
- an assistant that searches it through a tool, quotes what it finds, and says when the documents don't cover a
  question.

The concepts:

- [Knowledge base](../concepts/knowledge.md) (a partition in the API): a searchable set of your documents. Indexing
  turns each passage into embeddings, numbers that capture what it means, and search compares them.
- [`auth = "Maitento"`](../concepts/tools.md#when-the-agent-calls-your-server): a tool that calls Maitento's own API,
  signed for the run on every call, with no key to store.
- [A run input bound to a tool](../concepts/tools.md#values-from-the-run-not-the-model) (`inputs.functions.binding`):
  the run fills in one of the tool's arguments, and the model never sees it.

**Challenge:** the IT team wants the same assistant for their own policies. Make a second knowledge base,
`it-policies`, upload an IT security policy to it, and ask the `ask-handbook` interaction how often you must change
your password, without changing anything in `maitento/`. The solution is in
[`examples/13-your-documents/solution`](../../examples/13-your-documents/solution/), with an example policy.

**Next:** [14. Search the web](14-web-research.md) gives an agent the web, for what your documents don't cover.
