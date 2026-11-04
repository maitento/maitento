#:package Maitento.Sdk@26.11.1

using Maitento.Sdk;

// Deploys a small interaction and runs it. Your receiver hears about the run as it changes.
await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

var run = await mt.Interactions.RunAsync("fun-fact", new Dictionary<string, string> { ["topic"] = "octopuses" });
Console.WriteLine($"Run {run.Id} ended {run.Status}: {run.Output}");
