#:package Maitento.Sdk@26.11.1

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
