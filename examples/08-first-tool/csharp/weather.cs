#:package Maitento.Sdk@26.11.1

using Maitento.Entities.Interactions;
using Maitento.Sdk;
using Maitento.Sdk.Transcripts;

// The run, not the model, decides the unit: celsius, unless you pass another on the command line.
var temperatureUnit = args.Length > 0 ? args[0] : "celsius";

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

var inputs = new Dictionary<string, string> { ["city"] = "Lisbon", ["temperatureUnit"] = temperatureUnit };
var run = await mt.Interactions.RunAsync("weather", inputs);

// What the agent did: each tool call it made, and what came back.
foreach (var entry in MaitentoTranscript.Of(run))
{
    if (entry.Item is InteractionProcessContextToolCall call)
        Console.WriteLine($"Tool call: {call.FunctionName} {call.ArgumentsJson}");
    else if (entry.Item is InteractionProcessContextToolResult)
        Console.WriteLine($"Tool result: {(await mt.InteractionProcesses.GetToolResultAsync(run.Id, entry.Sequence))?.Result}");
}
Console.WriteLine($"\n{run.Output}");
