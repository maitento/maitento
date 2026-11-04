#:package Maitento.Sdk@26.11.1

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// Run the receipt app. Its main(string item, decimal price, int quantity) parameters are its inputs,
// and every input goes in as text.
var item = args.Length > 0 ? args[0] : "Notebook";
var price = args.Length > 1 ? args[1] : "4.5";
var quantity = args.Length > 2 ? args[2] : "3";
var run = await mt.Apps.RunAsync("receipt", new Dictionary<string, string> { ["item"] = item, ["price"] = price, ["quantity"] = quantity });

// What the app printed, what it returned, and every named output, in the order the app first set them.
foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nReturned: {run.ReturnValue}");
foreach (var output in run.Outputs) Console.WriteLine($"Output \"{output.Name}\": {output.Value}");
