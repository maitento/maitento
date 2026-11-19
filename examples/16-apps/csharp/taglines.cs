#:package Maitento.Sdk@26.11.2

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// Run the taglines app. Its main(string product) parameter is its one input.
var product = args.Length > 0 ? args[0] : "a reusable bamboo coffee cup";
var run = await mt.Apps.RunAsync("taglines", new Dictionary<string, string> { ["product"] = product });

// What the app printed, what it returned, and its named output.
foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nReturned: {run.ReturnValue}");
Console.WriteLine($"Output \"taglines\": {run.Outputs.FirstOrDefault(output => output.Name == "taglines")?.Value}");
