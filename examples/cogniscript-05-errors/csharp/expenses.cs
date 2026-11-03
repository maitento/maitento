#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Apps;
using Maitento.Sdk;
using Maitento.Sdk.Runs;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// The app's two inputs: the expenses, as "what amount" pairs separated by semicolons, and the spending limit.
var expenses = args.Length > 0 ? args[0] : "Taxi 23.50; Lunch 12; Hotel ninety; Train 41.20";
var limit = args.Length > 1 ? args[1] : "100";

// ThrowOnFailure = false hands back a failed run instead of throwing, so you can read what it reports.
var inputs = new Dictionary<string, string> { ["expenses"] = expenses, ["limit"] = limit };
var run = await mt.Apps.RunAsync("expenses", inputs, new RunOptions<AppProcess> { ThrowOnFailure = false });

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
