#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// The interaction declares two inputs: topic (required) and mood (optional).
var run = await mt.Interactions.RunAsync("haiku", new Dictionary<string, string>
{
    ["topic"] = "autumn rain",
    ["mood"] = "calm",
});
Console.WriteLine(run.Output);
