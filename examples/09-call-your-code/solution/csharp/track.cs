#:package Maitento.Sdk@26.11.2

using Maitento.Entities.Interactions;
using Maitento.Sdk;
using Maitento.Sdk.Transcripts;

await using var mt = MaitentoClient.CreateFromEnvironment();
// Both tools send the orders-api-key secret that the tutorial's setup stored.
await mt.DeployAsync("../maitento");

var message = "Hi, when will my desk lamp (order A-1002) arrive?";
Console.WriteLine($"Customer: {message}\n");

var run = await mt.Interactions.RunAsync("support", new Dictionary<string, string> { ["message"] = message });

foreach (var entry in MaitentoTranscript.Of(run))
{
    if (entry.Item is InteractionProcessContextToolCall call)
        Console.WriteLine($"Tool call: {call.FunctionName} {call.ArgumentsJson}");
}
Console.WriteLine($"\nSupport: {run.Output}");
