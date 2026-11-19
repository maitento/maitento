#:package Maitento.Sdk@26.11.2

using Maitento.Sdk;

// The challenge: deploy this folder's app, then total a list of orders.
await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

var orders = args.Length > 0 ? args[0] : File.ReadAllText("../data/orders.json");
var run = await mt.Apps.RunAsync("orders-total", new Dictionary<string, string> { ["orders"] = orders });

foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nReturned: {run.ReturnValue}");
foreach (var output in run.Outputs) Console.WriteLine($"Output \"{output.Name}\": {output.Value}");
