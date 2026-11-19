#:package Maitento.Sdk@26.11.2

using Maitento.Entities.Core;
using Maitento.Entities.Interactions;
using Maitento.Sdk;
using Maitento.Sdk.Runs;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// Read what you type, one line at a time.
string Ask(string prompt)
{
    Console.Write(prompt);
    return Console.ReadLine() ?? "bye";
}

// In a real app the person is signed in to your app, and these come from your own user record.
var name = Ask("Your name: ").Trim();
if (name.Length == 0) name = "Guest";
var personId = Guid.Parse("3f2c8a51-6d0e-4b8e-9a4b-2f1d7c9e5a10"); // your app's id for this person: any GUID

Console.WriteLine("Chat with the assistant. Type \"bye\" to finish.");

var run = await mt.Interactions.RunAsync("chat", options: new RunOptions<InteractionProcess>
{
    OnToken = (text, agent) => Console.Write(text),
    OnWaiting = async waiting =>
    {
        var message = Ask($"\n{name}: ");
        if (message.Trim().Equals("bye", StringComparison.OrdinalIgnoreCase))
        {
            await mt.Processes.KillAsync(waiting.Id, ProcessType.Interaction);
            return;
        }
        Console.Write("Assistant: ");
        // With an API key you may name the author: the name and id are recorded as you give them.
        await mt.InteractionProcesses.AddMessageAsync(waiting.Id, name, personId, message);
    },
    ThrowOnFailure = false,
});

// Who said what, as the run recorded it.
Console.WriteLine("\nRecorded:");
foreach (var m in run.Context.HumanMessage) Console.WriteLine($"- {m.Author.Name} ({m.Author.Id}): {m.Message}");
