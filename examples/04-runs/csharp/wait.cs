#:package Maitento.Sdk@26.11.1

using System.Diagnostics;
using Maitento.Entities.Database;
using Maitento.Entities.Interactions;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

var clock = Stopwatch.StartNew();
var run = await mt.InteractionProcesses.StartAsync(mt.DefaultNamespace!, "explain",
    [new NameValuePair("topic", "how rainbows form")]);
Console.WriteLine($"Started run {run.Id}");

// Read the run once a second until it ends, and say whenever its status changes.
InteractionProcessStatus? status = null;
while (true)
{
    if (run.Status != status)
    {
        status = run.Status;
        Console.WriteLine($"{clock.Elapsed.TotalSeconds:F1}s  {status}");
    }
    if (run.Status is InteractionProcessStatus.Finished or InteractionProcessStatus.Error or InteractionProcessStatus.Killed)
        break;
    await Task.Delay(TimeSpan.FromSeconds(1));
    run = (await mt.InteractionProcesses.GetInstanceAsync(run.Id))!;
}

// A finished run has its answer in Output; one that failed or was killed says why in FailureDetails.
Console.WriteLine(run.Status == InteractionProcessStatus.Finished ? Opening(run.Output) : run.FailureDetails);

// The first 160 characters of the answer.
static string Opening(string? text) => text is null ? "" : $"{text[..Math.Min(160, text.Length)]}…";
