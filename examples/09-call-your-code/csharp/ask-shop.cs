#:package Maitento.Sdk@26.11.2

using Maitento.Entities.Interactions;
using Maitento.Sdk;
using Maitento.Sdk.Transcripts;

// Which shop the customer is writing to: the name of the secret holding its key.
var secretName = args.Length > 0 ? args[0] : "second-shop-api-key";

await using var mt = MaitentoClient.CreateFromEnvironment();
// A run takes the secret's id: never its value, which stays in Maitento.
var secret = await mt.Secrets.GetByNameAsync(secretName)
    ?? throw new InvalidOperationException($"There is no secret called {secretName}: run setup first.");

var message = "Hi, has my oak bookshelf (order B-2001) shipped yet?";
Console.WriteLine($"Customer ({secretName}): {message}\n");

var inputs = new Dictionary<string, string> { ["message"] = message, ["shopKey"] = secret.Id.ToString() };
var run = await mt.Interactions.RunAsync("support-any-shop", inputs);

foreach (var entry in MaitentoTranscript.Of(run))
{
    if (entry.Item is InteractionProcessContextToolResult)
        Console.WriteLine($"Tool result: {(await mt.InteractionProcesses.GetToolResultAsync(run.Id, entry.Sequence))?.Result}");
}
Console.WriteLine($"\nSupport: {run.Output}");
