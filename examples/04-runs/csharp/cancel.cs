#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Core;
using Maitento.Entities.Database;
using Maitento.Entities.Interactions;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

var run = await mt.InteractionProcesses.StartAsync(mt.DefaultNamespace!, "explain",
    [new NameValuePair("topic", "how volcanoes work")]);
Console.WriteLine($"Started run {run.Id}");

// Let it get going, then stop it.
await Task.Delay(TimeSpan.FromSeconds(2));
await mt.Processes.KillAsync(run.Id, ProcessType.Interaction);
Console.WriteLine("Asked Maitento to kill it");

// A kill takes a moment: read the run back until it has stopped.
var stopped = (await mt.InteractionProcesses.GetInstanceAsync(run.Id))!;
while (stopped.Status is not (InteractionProcessStatus.Finished or InteractionProcessStatus.Error or InteractionProcessStatus.Killed))
{
    await Task.Delay(500);
    stopped = (await mt.InteractionProcesses.GetInstanceAsync(run.Id))!;
}

Console.WriteLine($"Run {stopped.Id}: {stopped.Status}");
Console.WriteLine($"Output: {stopped.Output ?? "none"}");
Console.WriteLine($"Why: {stopped.FailureDetails}");
