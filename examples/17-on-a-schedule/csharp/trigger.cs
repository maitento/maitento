#:package Maitento.Sdk@26.11.1

using Maitento.Entities.AutomatedActions;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
var automation = await mt.AutomatedActions.GetByNameAsync(mt.DefaultNamespace!, "daily-taglines")
    ?? throw new InvalidOperationException("Run schedule.cs first.");

// Run it now, instead of waiting for the schedule.
var processId = await mt.AutomatedActions.TriggerAsync(automation.Id);

// Every execution goes in the automation's history, newest first. Wait until this one has finished.
var entry = (await mt.AutomatedActions.GetHistoryAsync(automation.Id, limit: 1))[0];
for (var attempt = 1; attempt < 60 && !(entry.ProcessId == processId && entry.DateCompleted != null); attempt++)
{
    await Task.Delay(2000);
    entry = (await mt.AutomatedActions.GetHistoryAsync(automation.Id, limit: 1))[0];
}
var error = entry.ErrorMessage != null ? $" ({entry.ErrorMessage})" : "";
Console.WriteLine($"{entry.TriggerType} run {entry.ProcessId}: {entry.Outcome}{error}");

// The run itself is an ordinary app run.
if (entry.Outcome == ExecutionOutcome.Success)
{
    var run = (await mt.Apps.GetProcessAsync(processId))!;
    foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
}
