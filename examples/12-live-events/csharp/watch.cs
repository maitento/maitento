#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Interactions;
using Maitento.Entities.MessageBus.UserNotifications;
using Maitento.Entities.Processes;
using Maitento.Sdk;
using Maitento.Sdk.Notifications;

await using var mt = MaitentoClient.CreateFromEnvironment();

// User scope (the default) carries your own runs, whole. Tenant scope carries a short summary of every run in the tenant.
var tenant = args is ["tenant"];
await mt.Notifications.StartAsync(tenant ? NotificationScope.Tenant : NotificationScope.User);
Console.WriteLine($"Watching {(tenant ? "every run in the tenant" : "your runs")}. Press Ctrl+C to stop.");

var watcher = new Watcher();
mt.Notifications.Subscribe((INotificationClientHandlerInteractionProcessUpdated)watcher);
mt.Notifications.Subscribe((INotificationClientHandlerProcessUpdated)watcher);

// The SDK reconnects by itself, and raises Connected each time. Anything that changed in between was missed, so read
// what matters again.
mt.Notifications.Disconnected += (_, _) => Console.WriteLine($"{Watcher.Now}  Connection lost. Reconnecting…");
mt.Notifications.Connected += async (_, _) =>
{
    var active = await mt.Processes.ListAsync(new ProcessListRequest { State = "Active", Namespace = [mt.DefaultNamespace!] });
    Console.WriteLine($"{Watcher.Now}  Reconnected. Runs still going: {active.Items.Length}");
    foreach (var run in active.Items) Console.WriteLine($"{Watcher.Now}  {run.Id}  {run.Status}");
};

await Task.Delay(Timeout.Infinite);

class Watcher : INotificationClientHandlerInteractionProcessUpdated, INotificationClientHandlerProcessUpdated
{
    public static string Now => DateTime.Now.ToString("HH:mm:ss");

    // User scope: an interaction run changed. (Apps, capsules and code pipelines have events of their own.)
    public Task OnInteractionProcessUpdated(InteractionProcess run, string messageHash)
    {
        Console.WriteLine($"{Now}  {run.Id}  {run.Status}");
        return Task.CompletedTask;
    }

    // Tenant scope: any run of any kind changed.
    public Task OnProcessUpdated(ProcessUpdatedSummary run, string messageHash)
    {
        Console.WriteLine($"{Now}  {run.Id}  {run.Status}  ({run.Type})");
        return Task.CompletedTask;
    }
}
