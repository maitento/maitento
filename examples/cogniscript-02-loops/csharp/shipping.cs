#:package Maitento.Sdk@26.11.2

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// Run the shipping app. Its main(string weights, string destination) parameters are its inputs.
var weights = args.Length > 0 ? args[0] : "0.4, 3, kg, 12.5, , 45, 7";
var destination = args.Length > 1 ? args[1] : "UK";
var run = await mt.Apps.RunAsync("shipping", new Dictionary<string, string> { ["weights"] = weights, ["destination"] = destination });

// What the app printed, what it returned, and every named output, in the order the app first set them.
foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nReturned: {run.ReturnValue}");
foreach (var output in run.Outputs) Console.WriteLine($"Output \"{output.Name}\": {output.Value}");
