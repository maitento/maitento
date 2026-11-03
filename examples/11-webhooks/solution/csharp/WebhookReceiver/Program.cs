// The challenge: tutorial 11's receiver, which also says when a run is waiting for someone to approve a tool call.
using System.Collections.Concurrent;
using Maitento.Entities.Interactions;
using Maitento.Sdk.Webhooks;

var secret = Environment.GetEnvironmentVariable("WEBHOOK_SECRET")
    ?? throw new InvalidOperationException("Set WEBHOOK_SECRET to the secret you registered the webhook with.");

InteractionProcessStatus[] finished = [InteractionProcessStatus.Finished, InteractionProcessStatus.Error, InteractionProcessStatus.Killed];
var latest = new ConcurrentDictionary<Guid, DateTime>(); // run id -> dateUpdated of the newest delivery we have seen

var app = WebApplication.Create(args);

app.MapPut("/maitento/webhook", async (HttpRequest request) =>
{
    // Every delivery is signed with your secret. Verify checks the signature against the body, exactly as it
    // arrived, and that the delivery was signed in the last 5 minutes. Read the body once, for both.
    using var reader = new StreamReader(request.Body);
    var body = await reader.ReadToEndAsync();
    if (!MaitentoWebhooks.Verify(name => request.Headers[name], body, secret))
    {
        Console.WriteLine("401: a delivery without a valid signature");
        return Results.Unauthorized();
    }

    var delivery = MaitentoWebhooks.Parse(name => request.Headers[name], body);
    if (delivery.Entity is not InteractionProcess run)
        return Results.NoContent();

    // Deliveries can arrive more than once and out of order: keep only the newest state of each run.
    if (latest.TryGetValue(run.Id, out var seen) && seen >= run.DateUpdated)
        return Results.NoContent();
    latest[run.Id] = run.DateUpdated;

    Console.WriteLine($"{delivery.Type} {run.Id} is now {run.Status}");
    if (finished.Contains(run.Status) && run.Output != null)
        Console.WriteLine($"  output: {run.Output}");

    // The challenge: a run waiting for an approval says what it wants to do, so someone can decide.
    if (run.Status == InteractionProcessStatus.PendingApproval && run.PendingApproval is { } approval)
    {
        Console.WriteLine($"  needs approval: {approval.AgentName} wants to call {approval.FunctionName} with {approval.ArgumentsJson}");
        Console.WriteLine($"  approve with: mt interaction-approve {run.Id}");
    }

    // Answer quickly: Maitento waits up to 100 seconds, then tries again later.
    return Results.NoContent();
});

app.Run($"http://localhost:{Environment.GetEnvironmentVariable("PORT") ?? "3001"}");
