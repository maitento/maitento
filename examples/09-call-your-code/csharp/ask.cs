#:package Maitento.Sdk@26.11.2

using Maitento.Entities.Interactions;
using Maitento.Sdk;
using Maitento.Sdk.Transcripts;

await using var mt = MaitentoClient.CreateFromEnvironment();

var message = "Hi, I ordered a desk lamp last week (order A-1002). Has it shipped yet?";
Console.WriteLine($"Customer: {message}\n");

// The agent looks the order up on your server before it answers.
var run = await mt.Interactions.RunAsync("support", new Dictionary<string, string> { ["message"] = message });

// What the agent did: each tool call, and what your server answered.
foreach (var entry in MaitentoTranscript.Of(run))
{
    if (entry.Item is InteractionProcessContextToolCall call)
        Console.WriteLine($"Tool call: {call.FunctionName} {call.ArgumentsJson}");
    else if (entry.Item is InteractionProcessContextToolResult)
        Console.WriteLine($"Tool result: {(await mt.InteractionProcesses.GetToolResultAsync(run.Id, entry.Sequence))?.Result}");
}
Console.WriteLine($"\nSupport: {run.Output}");
