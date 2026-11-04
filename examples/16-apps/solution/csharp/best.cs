#:package Maitento.Sdk@26.11.1

using Maitento.Sdk;

// The challenge: deploy the tutorial's project, then this folder's app and interaction, which use its agent.
await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../../maitento");
await mt.DeployAsync("../maitento");

var run = await mt.Apps.RunAsync("best-tagline", new Dictionary<string, string> { ["product"] = "a reusable bamboo coffee cup" });
foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nReturned: {run.ReturnValue}");
