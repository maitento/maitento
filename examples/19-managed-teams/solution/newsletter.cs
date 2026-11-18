#:package Maitento.Sdk@26.10.0

using System.Text.Json;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("./maitento");

// The editor now has a headline writer too.
var run = await mt.Interactions.RunAsync("newsletter", new Dictionary<string, string>
{
    ["topic"] = "why sleep matters",
});

var members = run.Context.ToolCall
    .Where(c => c.FunctionName == "Dispatch")
    .Select(c => JsonDocument.Parse(c.ArgumentsJson).RootElement.GetProperty("agent").GetString())
    .ToList();
Console.WriteLine($"The editor handed out work {members.Count} times: {string.Join(", ", members)}\n");
Console.WriteLine(run.Output);
