#:package Maitento.Sdk@26.10.0

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

Console.WriteLine("Chat with the assistant. Type \"bye\" to finish.");

// The person speaks first, so the run waits for you straight away. Every time it waits, read a line and send it.
// The assistant's replies stream in through OnToken.
await mt.Interactions.RunAsync("chat", options: new RunOptions<InteractionProcess>
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
        Console.Write("Assistant: ");
        // No author named, so the message is recorded as the API key's user: you.
        await mt.InteractionProcesses.AddMessageAsync(run.Id, message);
    },
    // Saying bye stops the run, which is not a failure here.
    ThrowOnFailure = false,
});
