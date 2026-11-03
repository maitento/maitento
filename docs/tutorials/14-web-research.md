---
title: 14. Search the web
description: A research agent that searches the web, reads the pages it finds, and cites them.
sidebar:
  order: 14
---

# 14. Search the web

Build a research agent: ask it anything, and it searches the web, reads what it finds, and answers with its sources.
In tutorial 13 the agent searched your own documents. This one looks up everything else. Maitento has web search and
page reading built in, so there's no connector to write.

> **You'll learn**
>
> - how to give an agent web search and page reading, with two switches
> - where the pages it reads are kept, and for how long
> - what the agent does when a page can't be read
>
> **New concepts:** [web tools](../concepts/web-tools.md) ·
> [temporary knowledge bases](../concepts/web-tools.md#somewhere-to-keep-downloads)
>
> **Builds on:** [13. Your documents](13-your-documents.md)
>
> **Time:** ~10 min · **Cost:** under $0.01 on DeepSeek per question (about ten thousand tokens), plus each search
> and page read, which Maitento meters on the **Usage** page · **Needs:** nothing beyond Get started

## 1. Give an agent the web

Two switches on the agent give it the web:

<!-- snippet: examples/14-web-research/maitento/agents/researcher.mtr -->
```hcl title="maitento/agents/researcher.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a careful researcher. Search the web, read the most relevant pages, and only state what the pages support."
summary = "Researches questions on the web"
// Give the agent Maitento's built-in web tools. Every search and page fetch is metered.
allowWebSearch = true
allowWebFetch = true
```
<!-- /snippet -->

| Switch | The agent gets |
|---|---|
| `allowWebSearch = true` | `WebSearch`: up to 5 queries a call, with titles, links and snippets back |
| `allowWebFetch = true` | `WebFetch`, which reads up to 10 pages a call as text, and `WebRead`, which reads on through a long one |

These are tools like the ones you wrote in tutorials 8 and 13, but Maitento provides them. `WebFetch` reads PDFs,
Office documents and images too, not only web pages.

Research takes a while, so the interaction warns the agent at two minutes and stops it at four. Its task, in
`prompts/research-task.md`, asks for one paragraph and the list of pages used:

<!-- snippet: examples/14-web-research/maitento/interactions/one-shot/research.mtr -->
```hcl title="maitento/interactions/one-shot/research.mtr"
agent = {
  name = "Researcher"
  agent = @ref("researcher")
}
task = @prompt("research-task")
inputs.prompts = [
  {
    name = "question"
    description = "What to research"
    required = true
  }
]
// Research can take a while: warn the agent at 2 minutes and stop at 4.
duration.warn = "00:02:00"
duration.max = "00:04:00"
```
<!-- /snippet -->

### Ask it a question

The agent needs somewhere to keep the pages it reads, so it can read a long one in parts. That's a knowledge base,
like the handbook in tutorial 13, but a **temporary** one: its files are never indexed, and each is deleted after
`fileLifetimeHours` (here, 24). A run whose agent can read pages must have one, so the script makes it once and passes
it as `webDownloadPartitionId`:

<!-- tabs -->
<!-- snippet: examples/14-web-research/typescript/research.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// Pages the agent reads are kept for a day in a temporary knowledge base. Make one once and reuse it.
const partitions = await mt.partitions.list();
const downloads = partitions.find((p) => p.name === "web-downloads" && p.isTemporary)
  ?? (await mt.partitions.create({ name: "web-downloads", isTemporary: true, fileLifetimeHours: 24 }));

const question = process.argv[2] ?? "What is the tallest building in Lisbon, and how tall is it?";
const run = await mt.interactions.run("research", { inputs: { question }, webDownloadPartitionId: downloads.id });
console.log(run.output);

// Every search and every page read is a tool call in the run.
console.log("\nWhat the agent did:");
for (const call of run.context.toolCall) console.log(`- ${call.functionName} ${call.argumentsJson}`);
```
<!-- /snippet -->
<!-- snippet: examples/14-web-research/python/research.py -->
```python title="Python"
import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# Pages the agent reads are kept for a day in a temporary knowledge base. Make one once and reuse it.
partitions = mt.partitions.list()
downloads = next((p for p in partitions if p.name == "web-downloads" and p.is_temporary), None)
if downloads is None:
    downloads = mt.partitions.create("web-downloads", is_temporary=True, file_lifetime_hours=24)

question = sys.argv[1] if len(sys.argv) > 1 else "What is the tallest building in Lisbon, and how tall is it?"
run = mt.interactions.run("research", inputs={"question": question}, web_download_partition_id=downloads.id)
print(run.output)

# Every search and every page read is a tool call in the run.
print("\nWhat the agent did:")
for call in run.context.tool_call:
    print(f"- {call.function_name} {call.arguments_json}")
```
<!-- /snippet -->
<!-- snippet: examples/14-web-research/csharp/research.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Database;
using Maitento.Entities.Interactions;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// Pages the agent reads are kept for a day in a temporary knowledge base. Make one once and reuse it.
var partitions = await mt.Partitions.GetAllAsync();
var downloads = partitions.FirstOrDefault(p => p.Name == "web-downloads" && p.IsTemporary)
    ?? await mt.Partitions.CreateAsync("web-downloads", isTemporary: true, fileLifetimeHours: 24);

var question = args.Length > 0 ? args[0] : "What is the tallest building in Lisbon, and how tall is it?";
var run = await mt.Interactions.RunAsync("research", new InteractionProcessStartRequest
{
    Inputs = [new NameValuePair("question", question)],
    WebDownloadPartitionId = downloads.Id,
});
Console.WriteLine(run.Output);

// Every search and every page read is a tool call in the run.
Console.WriteLine("\nWhat the agent did:");
foreach (var call in run.Context.ToolCall) Console.WriteLine($"- {call.FunctionName} {call.ArgumentsJson}");
```
<!-- /snippet -->
```bash title="CLI"
mt deploy ./maitento
mt partition-create web-downloads --temporary --lifetime-hours 24
mt interaction-run research --input-question "What is the tallest building in Lisbon, and how tall is it?" --web-download-partition web-downloads
```
<!-- /tabs -->

```text
The tallest building in Lisbon is the Vasco da Gama Tower (Torre Vasco da Gama), a 160-metre (525 ft) lattice tower
with a 22-storey skyscraper section in Parque das Nações, built for Expo '98; a 72-metre hotel was added to its base
in 2012. …

- https://en.wikipedia.org/wiki/Vasco_da_Gama_Tower
- https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_Lisbon
- https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_Portugal

What the agent did:
- WebSearch {"queries":"tallest building in Lisbon height","page":"1"}
- WebFetch {"urls":"https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_Lisbon\nhttps://en.wikipedia.org/wiki/Vasco_da_Gama_Tower","maxChars":"4000"}
```

What happened:

1. The agent searched the web once, and got back titles, links and snippets.
2. It read the two most useful pages in one `WebFetch` call. Maitento downloaded them, turned them into text and
   kept them in `web-downloads`.
3. It answered from those pages, and listed them.

Open the run in the portal's **Runs**. The **Conversation** tab shows each search and page read with what came back,
and the **Web** tab shows which knowledge base the downloads went to.

**Done when:** the answer names the tower and lists the pages it used.

## 2. See what it kept

The pages are files in the temporary knowledge base. List the newest:

<!-- tabs -->
<!-- snippet: examples/14-web-research/typescript/downloads.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
const downloads = (await mt.partitions.list()).find((p) => p.name === "web-downloads" && p.isTemporary);
if (!downloads) throw new Error("Run research.ts first.");

// The newest files first. Each one is a page an agent read, with the run that read it.
const page = await mt.partitions.files(downloads.id, { limit: 5 });
for (const file of page.items) {
  console.log(`${file.webSource?.url}\n  read by run ${file.webSource?.processId}, deleted after ${file.expiresAt?.toISOString()}`);
}
```
<!-- /snippet -->
<!-- snippet: examples/14-web-research/python/downloads.py -->
```python title="Python"
import sys

from maitento import Maitento

mt = Maitento()
downloads = next((p for p in mt.partitions.list() if p.name == "web-downloads" and p.is_temporary), None)
if downloads is None:
    sys.exit("Run research.py first.")

# The newest files first. Each one is a page an agent read, with the run that read it.
page = mt.partitions.files(downloads.id, limit=5)
for file in page.items:
    source = file.web_source
    expires = file.expires_at.isoformat() if file.expires_at else None
    print(f"{source.url if source else file.name}\n  read by run {source.process_id if source else None}, deleted after {expires}")
```
<!-- /snippet -->
<!-- snippet: examples/14-web-research/csharp/downloads.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
var downloads = (await mt.Partitions.GetAllAsync()).FirstOrDefault(p => p.Name == "web-downloads" && p.IsTemporary)
    ?? throw new InvalidOperationException("Run research.cs first.");

// The newest files first. Each one is a page an agent read, with the run that read it.
var page = await mt.Partitions.GetFilesAsync(downloads.Id, limit: 5);
foreach (var file in page?.Items ?? [])
{
    Console.WriteLine($"{file.WebSource?.Url}\n  read by run {file.WebSource?.ProcessId}, deleted after {file.ExpiresAt:O}");
}
```
<!-- /snippet -->
```bash title="CLI"
mt partition-file-list <id> --limit 5
```
<!-- /tabs -->

```text
https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_Lisbon
  read by run 42b519e3-0def-4eec-9cea-2775d23607da, deleted after 2026-10-27T19:31:41.452Z
https://en.wikipedia.org/wiki/Vasco_da_Gama_Tower
  read by run 42b519e3-0def-4eec-9cea-2775d23607da, deleted after 2026-10-27T19:31:40.337Z
…
```

Each file remembers its address and the run that read it. A page read again within the hour comes from here, at no
charge, so if you ask twice, the second run reuses the first one's files. In the portal, open **Knowledge**,
then `web-downloads`.

**Done when:** you see the pages from step 1, each deleted a day after it was read.

## All the files

<!-- project: examples/14-web-research -->
**On GitHub:** [`examples/14-web-research`](https://github.com/maitento/maitento/tree/main/examples/14-web-research) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/14-web-research/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/14-web-research/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/14-web-research/csharp)

<details>
<summary>All the files in this project (3)</summary>

<!-- tabs: files -->
**`maitento/agents/researcher.mtr`**
```hcl title="maitento/agents/researcher.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a careful researcher. Search the web, read the most relevant pages, and only state what the pages support."
summary = "Researches questions on the web"
// Give the agent Maitento's built-in web tools. Every search and page fetch is metered.
allowWebSearch = true
allowWebFetch = true
```

**`maitento/interactions/one-shot/research.mtr`**
```hcl title="maitento/interactions/one-shot/research.mtr"
agent = {
  name = "Researcher"
  agent = @ref("researcher")
}
task = @prompt("research-task")
inputs.prompts = [
  {
    name = "question"
    description = "What to research"
    required = true
  }
]
// Research can take a while: warn the agent at 2 minutes and stop at 4.
duration.warn = "00:02:00"
duration.max = "00:04:00"
```

**`maitento/prompts/research-task.md`**
```md title="maitento/prompts/research-task.md"
Answer this question in one short paragraph: %%question%%

After the paragraph, list the web pages you used as a bulleted list of links.
```
<!-- /tabs -->

</details>

<!-- /project -->

## Break it on purpose

Ask about a page that doesn't exist:

<!-- tabs -->
```bash title="TypeScript"
node research.ts "Read https://www.maitento-tutorial-no-such-site.com/pricing and tell me what it says."
```
```bash title="Python"
python research.py "Read https://www.maitento-tutorial-no-such-site.com/pricing and tell me what it says."
```
```bash title="C#"
dotnet run research.cs "Read https://www.maitento-tutorial-no-such-site.com/pricing and tell me what it says."
```
<!-- /tabs -->

```text
I attempted to read the page at https://www.maitento-tutorial-no-such-site.com/pricing, but it could not be reached,
so I cannot report what it says; the address appears not to resolve to a live site. …

What the agent did:
- WebFetch {"urls":"https://www.maitento-tutorial-no-such-site.com/pricing"}
```

The fetch failed, and the tool told the agent so. In the run's **Conversation**, the `WebFetch` result says
`Failed (target_unreachable): The site could not be reached`. The agent reported that, instead of inventing a price
list, because its prompt says to state only what the pages support.

Addresses on private networks fail the same way. Maitento never fetches from them, so an agent can't read your own
`localhost`: the same reason tutorial 9 needed a tunnel.

## If it didn't work

- **The run won't start: `[api:web:download-partition-required]`.** An agent that can read pages needs a temporary
  knowledge base for its run. Pass `webDownloadPartitionId` (`--web-download-partition` in the CLI), or set a default
  once: in the portal's **Settings → Web tools**, with `mt web-access-set web-downloads`, or with
  `PUT /tenants/self/web-access` and `{"defaultWebDownloadPartitionId": "<id>"}`.
- **Creating `web-downloads` fails with a 403.** As in tutorial 13, only tenant admins can create knowledge bases.
  Ask one to create it, or to set the default.
- **Searches fail or time out.** Web search goes through a search provider, which can be slow. The agent gets the
  error, and may read pages it already knows about instead. Try again later. Reading pages still works.
- **The run stops at four minutes.** That's `duration.max` in the interaction. Ask a narrower question, or raise it.

## Review

You built:

- a research agent that searches the web, reads the best pages and cites them;
- a script that shows every search and page read the agent made;
- a temporary knowledge base that keeps those pages for a day.

The concepts:

- [Web tools](../concepts/web-tools.md): `allowWebSearch` and `allowWebFetch` give an agent `WebSearch`, `WebFetch`
  and `WebRead`, with no connector to write. Every search and page is metered.
- [Temporary knowledge base](../concepts/web-tools.md#somewhere-to-keep-downloads): where a run keeps the pages it
  read. Its files are never indexed, and are deleted after `fileLifetimeHours`.

**Challenge:** make a page summariser. Run the same `research` interaction on "Summarise
https://en.wikipedia.org/wiki/Vasco_da_Gama_Tower in three sentences.", with web search switched off for that run
only, so the agent can read but not search. Don't change the project. Hint: `webAccessOverrides`, in
[Web tools](../concepts/web-tools.md#switching-them-on-and-off-per-run). The solution is in
[`examples/14-web-research/solution`](../../examples/14-web-research/solution/).

**Next:** [15. Files for agents](15-files-for-agents.md) lets an agent read *and write* files.
