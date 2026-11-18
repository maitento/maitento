#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// The order goes in as JSON text: an app's inputs are always text.
var order = args.Length > 0 ? args[0] : File.ReadAllText("../data/order.json");
var run = await mt.Apps.RunAsync("order-summary", new Dictionary<string, string> { ["order"] = order });

// What the app printed, what it returned, and every named output, in the order the app first set them.
foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nReturned: {run.ReturnValue}");
foreach (var output in run.Outputs) Console.WriteLine($"Output \"{output.Name}\": {output.Value}");
