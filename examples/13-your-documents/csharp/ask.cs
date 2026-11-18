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
