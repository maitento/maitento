#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Apps;
using Maitento.Sdk;
using Maitento.Sdk.Runs;

// The challenge: deploy this folder's app, then claim a refund it should refuse.
await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

var expenses = args.Length > 0 ? args[0] : "Taxi 23.50; Refund -10; Train 41.20";
var limit = args.Length > 1 ? args[1] : "100";
var inputs = new Dictionary<string, string> { ["expenses"] = expenses, ["limit"] = limit };
var run = await mt.Apps.RunAsync("expenses-strict", inputs, new RunOptions<AppProcess> { ThrowOnFailure = false });

foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nStatus: {run.Status}");
if (run.Status == AppProcessStatus.Finished)
{
    Console.WriteLine($"Returned: {run.ReturnValue}");
    foreach (var output in run.Outputs) Console.WriteLine($"Output \"{output.Name}\": {output.Value}");
}
else
{
    Console.WriteLine($"Failure: {run.FailureDetails}");
}
