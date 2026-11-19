#:package Maitento.Sdk@26.11.2

using Maitento.Entities.Database;
using Maitento.Entities.Interactions;
using Maitento.Entities.WebAccess;
using Maitento.Sdk;

// The challenge: summarise one page, with web search switched off for this run only.
await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../../maitento");

var downloads = (await mt.Partitions.GetAllAsync()).FirstOrDefault(p => p.Name == "web-downloads" && p.IsTemporary)
    ?? await mt.Partitions.CreateAsync("web-downloads", isTemporary: true, fileLifetimeHours: 24);

var run = await mt.Interactions.RunAsync("research", new InteractionProcessStartRequest
{
    Inputs = [new NameValuePair("question", "Summarise https://en.wikipedia.org/wiki/Vasco_da_Gama_Tower in three sentences.")],
    WebDownloadPartitionId = downloads.Id,
    // With no AgentName, the override applies to every agent in the run. Fetching stays on.
    WebAccessOverrides = [new WebAccessOverride { Search = false }],
});
Console.WriteLine(run.Output);

Console.WriteLine("\nWhat the agent did:");
foreach (var call in run.Context.ToolCall) Console.WriteLine($"- {call.FunctionName} {call.ArgumentsJson}");
