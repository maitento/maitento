#:package Maitento.Sdk@26.11.1

using Maitento.Entities.Database;
using Maitento.Entities.Interactions;
using Maitento.Entities.MessageBus.UserNotifications;
using Maitento.Sdk;
using Maitento.Sdk.Notifications;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// One WebSocket to Maitento. Every change to your runs arrives over it.
await mt.Notifications.StartAsync();

// Follow the run whose id you pass, or start a new one.
var id = args.Length > 0
    ? Guid.Parse(args[0])
    : (await mt.InteractionProcesses.StartAsync(mt.DefaultNamespace!, "describe", [new NameValuePair("place", "Lisbon")])).Id;
Console.WriteLine($"Following run {id}");

var follower = new Follower();

// The whole run, every time it changes; and the reply, a few words at a time, as the model writes it.
mt.Notifications.Subscribe((INotificationClientHandlerInteractionProcessUpdated)follower, id);
mt.Notifications.Subscribe((INotificationClientHandlerInteractionStream)follower, id);

// Events sent while the connection was down are lost, so read the run again when it comes back.
mt.Notifications.Connected += async (_, _) => follower.Show((await mt.InteractionProcesses.GetInstanceAsync(id))!);

// Events only tell you about changes from now on. The run may already have moved, or even ended: read it once now.
follower.Show((await mt.InteractionProcesses.GetInstanceAsync(id))!);

var run = await follower.Ended.Task;
Console.WriteLine($"Output: {run.Output?.Length ?? 0} characters");

// Receives the run's events, in the order they arrived. The read-back above can overtake an event, so an update older
// than the one already shown is ignored.
class Follower : INotificationClientHandlerInteractionProcessUpdated, INotificationClientHandlerInteractionStream
{
    private readonly Lock gate = new();
    private InteractionProcess? latest;

    public TaskCompletionSource<InteractionProcess> Ended { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

    // Say whenever the status changes, and finish once the run has ended.
    public void Show(InteractionProcess run)
    {
        lock (gate)
        {
            if (latest is not null && run.DateUpdated < latest.DateUpdated) return;
            if (run.Status != latest?.Status) Console.WriteLine($"\n[{run.Status}]");
            latest = run;
            if (run.Status is InteractionProcessStatus.Finished or InteractionProcessStatus.Error or InteractionProcessStatus.Killed)
                Ended.TrySetResult(run);
        }
    }

    public Task OnInteractionProcessUpdated(InteractionProcess process, string messageHash)
    {
        Show(process);
        return Task.CompletedTask;
    }

    public Task OnInteractionStream(InteractionStreamUserNotification notification, string messageHash)
    {
        if (notification.Type == AiStreamingMessageType.Chat) Console.Write(notification.Stream);
        return Task.CompletedTask;
    }
}
