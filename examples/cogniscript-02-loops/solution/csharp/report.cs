#:package Maitento.Sdk@26.11.2

using Maitento.Sdk;

// The challenge: deploy this folder's app, shipping-report, and run it with the tutorial's parcels.
await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

var weights = args.Length > 0 ? args[0] : "0.4, 3, kg, 12.5, , 45, 7";
var destination = args.Length > 1 ? args[1] : "UK";
var run = await mt.Apps.RunAsync("shipping-report", new Dictionary<string, string> { ["weights"] = weights, ["destination"] = destination });
foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nReturned: {run.ReturnValue}");
