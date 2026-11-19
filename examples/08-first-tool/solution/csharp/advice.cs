#:package Maitento.Sdk@26.11.2

using Maitento.Entities.Interactions;
using Maitento.Sdk;
using Maitento.Sdk.Transcripts;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

var run = await mt.Interactions.RunAsync("run-advice", new Dictionary<string, string> { ["city"] = "Lisbon" });

// The agent should call both tools: the weather, and the air.
foreach (var entry in MaitentoTranscript.Of(run))
{
    if (entry.Item is InteractionProcessContextToolCall call)
        Console.WriteLine($"Tool call: {call.FunctionName} {call.ArgumentsJson}");
}
Console.WriteLine($"\n{run.Output}");
