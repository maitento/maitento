#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

// The challenge: deploy this folder's app, compare, and quote the tutorial's parcels for three destinations.
await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

var weights = args.Length > 0 ? args[0] : "0.4, 3, kg, 12.5, , 45, 7";
var destinations = args.Length > 1 ? args[1] : "UK, EU, World";
var run = await mt.Apps.RunAsync("compare", new Dictionary<string, string> { ["weights"] = weights, ["destinations"] = destinations });
foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nReturned: {run.ReturnValue}");
