#:package Maitento.Sdk@26.11.1

using Maitento.Sdk;

// Run sandbox.cs first: the workbench capsule mounts the sales-data file system it creates.
await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// The app starts the workbench capsule, then lets the analyst run commands in it until it can answer.
var run = await mt.Apps.RunAsync("analyst", new Dictionary<string, string>
{
    ["question"] = args.Length > 0 ? args[0] : "Which region brought in the most revenue, and how much?",
    ["namespaceName"] = mt.DefaultNamespace ?? "tutorials",
});

foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nAnswer: {run.ReturnValue}");
