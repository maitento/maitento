#:package Maitento.Sdk@26.10.0

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

var notes = await mt.VirtualFileSystems.GetByNameAsync(mt.DefaultNamespace!, "notes")
    ?? throw new InvalidOperationException("Run setup.cs first.");

var request = args.Length > 0 ? args[0] : "Add eggs and coffee to my shopping list, then tell me what is on it.";

// notesVfsId fills in the file system's id for all three tools. The model never sees it.
var run = await mt.Interactions.RunAsync("notes", new Dictionary<string, string>
{
    ["request"] = request,
    ["notesVfsId"] = notes.Id.ToString(),
});
Console.WriteLine(run.Output);

Console.WriteLine("\nWhat the agent did:");
foreach (var call in run.Context.ToolCall) Console.WriteLine($"- {call.FunctionName} {call.ArgumentsJson}");

Console.WriteLine("\nThe file now says:\n" + await mt.VirtualFileSystems.ReadTextById(notes.Id, "/shopping.md"));
