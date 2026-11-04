#:package Maitento.Sdk@26.11.1

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// Run the headlines app: one headline per topic, at most two at a time.
var topics = args.Length > 0 ? args[0] : "electric cars, city farming, space tourism, quantum computing";
var run = await mt.Apps.RunAsync("headlines", new Dictionary<string, string> { ["topics"] = topics });

foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nReturned: {run.ReturnValue}");
foreach (var output in run.Outputs) Console.WriteLine($"Output \"{output.Name}\": {output.Value}");
