#:package Maitento.Sdk@26.11.1

using Maitento.Entities.Core;
using Maitento.Entities.Interactions;
using Maitento.Sdk;
using Maitento.Sdk.Runs;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");
await mt.Notifications.StartAsync();

string Ask(string prompt)
{
    Console.Write(prompt);
    return Console.ReadLine() ?? "bye";
}

// Wren keeps a separate memory for each person, chosen by the userName input.
var userName = args.Length > 0 ? args[0] : Ask("Your name: ");
Console.WriteLine($"Talking to Wren as {userName}. Type \"bye\" to finish.");

var inputs = new Dictionary<string, string> { ["userName"] = userName };
await mt.Interactions.RunAsync("wren-chat", inputs, new RunOptions<InteractionProcess>
{
    OnToken = (text, agent) => Console.Write(text),
    OnWaiting = async run =>
    {
        var message = Ask("\nYou: ");
        if (message.Trim().Equals("bye", StringComparison.OrdinalIgnoreCase))
        {
            await mt.Processes.KillAsync(run.Id, ProcessType.Interaction);
            return;
        }
        Console.Write("Wren: ");
        // The message is signed with the person's name. They are not a Maitento user, so there is no user id.
        await mt.InteractionProcesses.AddMessageAsync(run.Id, userName, Guid.Empty, message);
    },
    ThrowOnFailure = false,
});
