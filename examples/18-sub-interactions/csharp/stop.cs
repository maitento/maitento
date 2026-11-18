#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Core;
using Maitento.Entities.Interactions;
using Maitento.Sdk;
using Maitento.Sdk.Runs;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.Notifications.StartAsync();

// Run the comparison again, and stop the first sub-interaction as soon as the lead researcher has started it.
Guid? stopped = null;
var inputs = new Dictionary<string, string> { ["countries"] = "Portugal, Japan, Kenya" };
var run = await mt.Interactions.RunAsync("compare-countries", inputs, new RunOptions<InteractionProcess>
{
    OnUpdate = async current =>
    {
        var first = current.Swarm?.Children.FirstOrDefault();
        if (first != null && stopped == null)
        {
            stopped = first.ProcessId;
            await mt.Processes.KillAsync(first.ProcessId, ProcessType.Interaction);
            Console.WriteLine($"Stopped sub-interaction {first.ProcessId}\n");
        }
    },
});
Console.WriteLine(run.Output);
