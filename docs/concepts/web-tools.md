---
title: Web tools
description: Let agents search the web and read pages, PDFs and documents, with no connectors to write.
sidebar:
  order: 8
---

# Web tools

Maitento has built-in tools for the web. Switch them on for an agent and it can search the web and read pages, PDFs,
Office documents and images, with no connector to write.

<!-- snippet: examples/14-web-research/maitento/agents/researcher.mtr -->
```hcl title="agents/researcher.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You are a careful researcher. Search the web, read the most relevant pages, and only state what the pages support."
summary = "Researches questions on the web"
// Give the agent Maitento's built-in web tools. Every search and page fetch is metered.
allowWebSearch = true
allowWebFetch = true
```
<!-- /snippet -->

| Setting | The agent gets |
|---|---|
| `allowWebSearch = true` | `WebSearch`: up to 5 queries per call, with titles, links and snippets back |
| `allowWebFetch = true` | `WebFetch` and `WebRead`: read up to 10 URLs per call, and continue long documents part by part |

See it in [tutorial 14, Search the web](../tutorials/14-web-research.md): a research agent that searches, reads the
pages it finds and cites them, and what it does with a page that can't be read.

## Somewhere to keep downloads

Pages and files an agent fetches are kept for a while in a **temporary knowledge base**, so it can read long
documents in parts. A run whose agents can fetch needs one. Create it once:

<!-- tabs -->
```ts
const downloads = await mt.partitions.create({ name: "web-downloads", isTemporary: true, fileLifetimeHours: 24 });
```
```python
downloads = mt.partitions.create(name="web-downloads", is_temporary=True, file_lifetime_hours=24)
```
```csharp
var downloads = await mt.Partitions.CreateAsync("web-downloads", isTemporary: true, fileLifetimeHours: 24);
```
```bash
mt partition-create web-downloads --temporary --lifetime-hours 24
```
<!-- /tabs -->

Then give its id when you start a run, as `webDownloadPartitionId`. To avoid passing it every time, set it once as
the default for the whole tenant (`PUT /tenants/self/web-access`) or for one namespace
(`PUT /namespaces/by-id/{id}/web-access`), with a body of `{"defaultWebDownloadPartitionId": "<id>"}`, or in the
portal's **Settings → Web tools**. A run that names none uses its namespace's default, else the tenant's.

Files in a temporary knowledge base are never indexed for search: each is a page an agent read, with the URL and the
run that read it (`webSource`), and it is deleted after `fileLifetimeHours`. List them like any knowledge base's files
to see what your agents read, as [tutorial 14](../tutorials/14-web-research.md#2-see-what-it-kept) does.

In the CLI, the start and run commands (`interaction-run`, `app-run`, `code-pipeline-run`, and their `-start` forms)
take it as `--web-download-partition`, by id or name, and `web-access-set` sets the default:

```bash
mt interaction-run research --input-question "…" --web-download-partition web-downloads
mt web-access-set web-downloads                       # the tenant's default
mt web-access-set web-downloads --namespace tutorials  # one namespace's
mt web-access-get                                     # what the default is now
```

## Switching them on and off per run

- In an interaction, an agent's seat can override the agent: `webAccess = { search = true fetch = false }`.
- When you start a run, `webAccessOverrides` can switch the tools on or off for all agents or for one agent by name.
- Run settings win over the seat, and the seat wins over the agent.

Tutorial 14's challenge reads a page with search switched off for one run, with `webAccessOverrides`.

## Good to know

- **Every search and every page is metered**, and shows in [usage](runs-and-events.md#usage).
- **Some addresses are off limits.** Private networks (so `localhost` too) and Maitento's own hosts are refused,
  and only ports 80, 443, 8080 and 8443 work. A page that can't be read is not an error in the run: the agent is
  told why, such as `Failed (target_unreachable): The site could not be reached`, and carries on.
- **Downloads expire.** Files in a temporary knowledge base are removed after their lifetime (24 hours by default).
- **A page read again within the hour is reused**: the copy already in the knowledge base is returned, and the page
  isn't fetched or charged again.
- **Fetching needs somewhere to keep the page.** A run that can fetch pages but has no downloads knowledge base, on
  the run or as the default, is refused with `api:web:download-partition-required`.
- **Routers don't get web tools.** A [router](teams.md#routers) only chooses who answers.
