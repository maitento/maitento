#:package Maitento.Sdk@26.11.1

using Maitento.Sdk;

// The challenge: deploy the tutorial's project, then this folder's app, which uses its headline interaction.
await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../../maitento");
await mt.DeployAsync("../maitento");

var topics = args.Length > 0 ? args[0] : "electric cars, city farming, space tourism, quantum computing";
var run = await mt.Apps.RunAsync("headlines-window", new Dictionary<string, string> { ["topics"] = topics });

foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nReturned: {run.ReturnValue}");
foreach (var output in run.Outputs) Console.WriteLine($"Output \"{output.Name}\": {output.Value}");
