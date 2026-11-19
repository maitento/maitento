#:package Maitento.Sdk@26.11.2

using Maitento.Entities.Apps;
using Maitento.Sdk;

// Run tonight's digest now, instead of waiting for 23:55 UTC.
await using var mt = MaitentoClient.CreateFromEnvironment();
var ns = mt.DefaultNamespace ?? "tutorials";
var automation = (await mt.AutomatedActions.GetByNameAsync(ns, "nightly-digest"))!;
var processId = await mt.AutomatedActions.TriggerAsync(automation.Id);
Console.WriteLine($"Started the nightly-digest app: {processId}");

// Follow the app run until it ends.
AppProcessStatus[] finished = [AppProcessStatus.Finished, AppProcessStatus.Error, AppProcessStatus.Killed];
var run = (await mt.Apps.GetProcessAsync(processId))!;
while (!finished.Contains(run.Status))
{
    await Task.Delay(2000);
    run = (await mt.Apps.GetProcessAsync(processId))!;
}
foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
if (run.Status != AppProcessStatus.Finished)
    throw new InvalidOperationException($"The digest ended {run.Status}: {run.FailureDetails}");

Console.WriteLine($"\n{run.ReturnValue}\n");
Console.WriteLine(await mt.VirtualFileSystems.ReadTextByName("support-desk", ns, "/reports/latest.md"));
