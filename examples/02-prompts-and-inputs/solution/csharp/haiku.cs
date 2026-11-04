#:package Maitento.Sdk@26.11.1

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// A third input, language, is optional like mood: leave it out and the haiku is in English.
var run = await mt.Interactions.RunAsync("haiku", new Dictionary<string, string>
{
    ["topic"] = "autumn rain",
    ["mood"] = "calm",
    ["language"] = "Portuguese",
});
Console.WriteLine(run.Output);
