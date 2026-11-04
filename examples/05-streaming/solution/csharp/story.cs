#:package Maitento.Sdk@26.11.1

using Maitento.Entities.Interactions;
using Maitento.Sdk;
using Maitento.Sdk.Runs;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// OnUpdate gets each new state of the run, and a run changes often. Print its status only when that changes.
InteractionProcessStatus? status = null;
var inputs = new Dictionary<string, string> { ["subject"] = "a hedgehog who is afraid of the dark" };
var run = await mt.Interactions.RunAsync("story", inputs, new RunOptions<InteractionProcess>
{
    OnToken = (text, agent) => Console.Write(text),
    OnUpdate = update =>
    {
        if (update.Status != status)
        {
            status = update.Status;
            Console.WriteLine($"\n[{status}]");
        }
        return Task.CompletedTask;
    },
});

Console.WriteLine($"\n[the output has {run.Output?.Length ?? 0} characters]");
