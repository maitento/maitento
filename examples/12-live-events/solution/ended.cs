#:package Maitento.Sdk@26.11.1

// Tutorial 12's challenge: whenever one of your runs ends, say how long it worked and how many tokens it used.
using Maitento.Entities.Interactions;
using Maitento.Sdk;
using Maitento.Sdk.Notifications;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.Notifications.StartAsync();
mt.Notifications.Subscribe(new Reporter(mt));
Console.WriteLine("Waiting for your runs to end. Press Ctrl+C to stop.");

await Task.Delay(Timeout.Infinite);

class Reporter(IMaitentoClient mt) : INotificationClientHandlerInteractionProcessUpdated
{
    public async Task OnInteractionProcessUpdated(InteractionProcess run, string messageHash)
    {
        if (run.Status is not (InteractionProcessStatus.Finished or InteractionProcessStatus.Error or InteractionProcessStatus.Killed))
            return;
        // The event carries the whole run. Its summary (tutorial 4) adds up the tokens.
        var tokens = (await mt.Processes.GetByIdAsync(run.Id))?.Tokens;
        Console.WriteLine($"{run.Id}  {run.Status} after {run.ExecutionTime.TotalSeconds:F1}s, {tokens?.Input} tokens in and {tokens?.Output} out");
    }
}
