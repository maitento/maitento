#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Database;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// StartAsync returns as soon as Maitento has the run. It doesn't wait for the answer.
var run = await mt.InteractionProcesses.StartAsync(mt.DefaultNamespace!, "explain",
    [new NameValuePair("topic", "why the sky is blue")]);

Console.WriteLine($"Started run {run.Id}: {run.Status}");
Console.WriteLine($"Check on it with: dotnet run status.cs {run.Id}");
