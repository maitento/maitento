#:package Maitento.Sdk@26.11.2

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();

// Deploys the greeter (unchanged, so it stays at its current version) and the new joke interaction.
await mt.DeployAsync("../maitento");

var run = await mt.Interactions.RunAsync("joke");
Console.WriteLine(run.Output);
