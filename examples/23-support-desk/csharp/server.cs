#:sdk Microsoft.NET.Sdk.Web
#:package Maitento.Sdk@26.10.0
#:property PublishAot=false

// Acme Coffee's support desk: the console's API (/api), the webhook Maitento calls (/maitento/webhook), and the shop
// API the desk's tools call (/shop). The page itself is ../web, served as it is. The API is described in ../web/API.md.
// Run it with: dotnet run server.cs. (PublishAot=false: it reads and writes JSON by reflection, which an app compiled
// ahead of time, the default for a file-based app, can't.)
using System.Collections.Concurrent;
using System.Net.ServerSentEvents;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using Maitento.Entities.Apps;
using Maitento.Entities.Database;
using Maitento.Entities.Interactions;
using Maitento.Entities.Looms;
using Maitento.Sdk;
using Maitento.Sdk.Webhooks;
using Microsoft.Extensions.FileProviders;

var port = Environment.GetEnvironmentVariable("PORT") ?? "3000";
var apiKey = Environment.GetEnvironmentVariable("SHOP_API_KEY");
var webhookSecret = Environment.GetEnvironmentVariable("WEBHOOK_SECRET");
if (string.IsNullOrEmpty(apiKey) || string.IsNullOrEmpty(webhookSecret))
    throw new InvalidOperationException("Set SHOP_API_KEY and WEBHOOK_SECRET, the values you gave setup.cs.");

await using var mt = MaitentoClient.CreateFromEnvironment();
var ns = mt.DefaultNamespace ?? "tutorials";

// The desk's state, saved in desk.json so it survives a restart. Reset starts again from ../data/orders.json.
var json = new JsonSerializerOptions(JsonSerializerOptions.Web) { WriteIndented = true };
var deskFile = Environment.GetEnvironmentVariable("DESK_FILE") ?? "desk.json";
Desk FreshDesk() => new([], JsonSerializer.Deserialize<List<Order>>(File.ReadAllText("../data/orders.json"), json)!);
var desk = File.Exists(deskFile) ? JsonSerializer.Deserialize<Desk>(File.ReadAllText(deskFile), json)! : FreshDesk();
var gate = new object(); // requests and webhooks arrive on many threads: one change at a time
void Save() => File.WriteAllText(deskFile, JsonSerializer.Serialize(desk, json));
IResult Error(string message, int status) => Results.Json(new { error = message }, statusCode: status);

var app = WebApplication.Create(args);
var web = new PhysicalFileProvider(Path.GetFullPath("../web"));
app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = web });
app.UseStaticFiles(new StaticFileOptions { FileProvider = web });

// The browser listens on /api/events, and hears about every change as it happens (Server-Sent Events).
#region events
var listeners = new ConcurrentDictionary<Channel<SseItem<string>>, bool>();
void Send(string type, object data)
{
    var item = new SseItem<string>(JsonSerializer.Serialize(data, JsonSerializerOptions.Web), type);
    foreach (var listener in listeners.Keys) listener.Writer.TryWrite(item);
}
void Update(Ticket ticket, Action<Ticket> change)
{
    lock (gate)
    {
        change(ticket);
        Save();
        Send("ticket", ticket);
    }
}

app.MapGet("/api/events", (CancellationToken closed) =>
{
    var listener = Channel.CreateUnbounded<SseItem<string>>();
    listener.Writer.TryWrite(new SseItem<string>("{}", "ping")); // the stream starts at its first event
    listeners[listener] = true;
    closed.Register(() => listeners.TryRemove(listener, out _));
    return TypedResults.ServerSentEvents(listener.Reader.ReadAllAsync(closed));
});
using var keepAlive = new Timer(_ => Send("ping", new { }), null, 15_000, 15_000); // keeps proxies from closing a quiet stream
#endregion

// The two knowledge bases setup made: the shop's policies, and a temporary one for web pages the agent reads.
(Guid Policies, Guid WebPages)? knowledgeBases = null;
async Task<(Guid Policies, Guid WebPages)> FindKnowledgeBases()
{
    if (knowledgeBases is { } found) return found;
    var partitions = await mt.Partitions.GetAllAsync();
    var policies = partitions.FirstOrDefault(p => p.Name == "shop-policies" && !p.IsTemporary);
    var webPages = partitions.FirstOrDefault(p => p.Name == "web-downloads" && p.IsTemporary);
    if (policies == null || webPages == null)
        throw new InvalidOperationException("The shop-policies knowledge base is missing: run setup.cs first.");
    knowledgeBases = (policies.Id, webPages.Id);
    return knowledgeBases.Value;
}

app.MapGet("/api/status", async () =>
{
    try
    {
        await FindKnowledgeBases();
        return Results.Ok(new { ok = true, error = (string?)null });
    }
    catch (Exception e)
    {
        return Results.Ok(new { ok = false, error = e.Message });
    }
});

app.MapGet("/api/tickets", () =>
{
    lock (gate) return Results.Ok(new { tickets = desk.Tickets.ToList() });
});

app.MapGet("/api/scenarios", () =>
    Results.Ok(new { scenarios = JsonDocument.Parse(File.ReadAllText("../data/scenarios.json")).RootElement }));

// 1. A ticket comes in: triage it, then start drafting the reply.
#region ticket
app.MapPost("/api/tickets", (NewTicket body) =>
{
    if (string.IsNullOrWhiteSpace(body.Customer) || body.Email?.Contains('@') != true || string.IsNullOrWhiteSpace(body.Message))
        return Error("A ticket needs a customer, an email address and a message.", 400);
    Ticket ticket;
    lock (gate)
    {
        ticket = new Ticket
        {
            Id = $"T-{1001 + desk.Tickets.Count}", Customer = body.Customer.Trim(), Email = body.Email.Trim(),
            Subject = body.Subject?.Trim() ?? "", Message = body.Message.Trim(), Created = DateTime.UtcNow.ToString("O"),
        };
        desk.Tickets.Insert(0, ticket);
    }
    Update(ticket, _ => { });
    _ = Task.Run(() => Work(ticket)); // the browser hears how it goes over /api/events
    return Results.Created($"/api/tickets/{ticket.Id}", ticket);
});

async Task Work(Ticket ticket)
{
    try
    {
        // Triage takes a few seconds and answers in JSON, so wait for it (tutorial 3).
        var triageRun = await mt.Interactions.RunAsync("triage-ticket",
            new Dictionary<string, string> { ["message"] = ticket.Message });
        var triage = JsonSerializer.Deserialize<Triage>(triageRun.Output!, json)!;
        Update(ticket, t => { t.Triage = triage; t.Status = "triaged"; });

        // The reply can take a minute, and may wait for a person to approve a refund.
        // Start it and move on: the webhook says when it changes (tutorial 11).
        var (policies, webPages) = await FindKnowledgeBases();
        List<NameValuePair> inputs =
        [
            new("customer", ticket.Customer), new("email", ticket.Email), new("message", ticket.Message),
            new("category", triage.Category), new("urgency", triage.Urgency), new("policiesId", policies.ToString()),
        ];
        if (triage.OrderId != null) inputs.Add(new("orderId", triage.OrderId));
        var run = await mt.InteractionProcesses.StartAsync(ns, "draft-reply", new InteractionProcessStartRequest
        {
            Inputs = [.. inputs],
            WebDownloadPartitionId = webPages, // where web pages the agent reads are kept (tutorial 14)
        });
        Update(ticket, t =>
        {
            t.RunId = run.Id;
            t.LoomId = run.Looms.FirstOrDefault()?.Loom; // this customer's memory (tutorial 20)
            t.Status = "drafting";
        });
    }
    catch (Exception e)
    {
        Update(ticket, t => { t.Status = "failed"; t.Error = e.Message; });
    }
}
#endregion

// 2. Maitento calls this whenever an interaction run or an app run changes (tutorial 11).
#region webhook
app.MapPut("/maitento/webhook", async (HttpRequest request) =>
{
    var body = await new StreamReader(request.Body).ReadToEndAsync(); // the raw body, which the signature covers
    if (!MaitentoWebhooks.Verify(name => request.Headers[name], body, webhookSecret))
        return Results.Unauthorized();
    var delivery = MaitentoWebhooks.Parse(name => request.Headers[name], body);
    _ = Task.Run(async () => // answer at once, and do the work after
    {
        try
        {
            if (delivery.Entity is InteractionProcess run) await RunChanged(run);
            if (delivery.Entity is AppProcess appRun) DigestChanged(appRun);
        }
        catch (Exception e)
        {
            Console.Error.WriteLine($"Webhook for {delivery.Id}: {e.Message}");
        }
    });
    return Results.NoContent();
});

async Task RunChanged(InteractionProcess run)
{
    // Webhooks come for every run in the tenant: keep only this desk's. Deliveries can repeat and arrive out of
    // order, so keep only the newest state of each run.
    Ticket? ticket;
    lock (gate) ticket = desk.Tickets.Find(t => t.RunId == run.Id);
    bool IsOld() => ticket?.Updated is { } seen && run.DateUpdated <= seen;
    if (ticket == null || IsOld()) return;
    var steps = await ToolCalls(run, ticket.Steps);

    var approval = run.Status == InteractionProcessStatus.PendingApproval ? run.PendingApproval : null;
    Update(ticket, t =>
    {
        if (IsOld()) return; // a newer delivery got here while the tool results were being read
        t.Updated = run.DateUpdated;
        t.Steps = steps;
        t.Approval = approval == null ? null : new Approval(approval.Id, approval.FunctionName, approval.ArgumentsJson);
        t.Reply = run.Output;
        t.Error = run.FailureDetails;
        t.Status = run.Status switch
        {
            InteractionProcessStatus.PendingApproval => "approval",
            InteractionProcessStatus.Finished => t.Decision?.Approved == false ? "rejected" : "replied",
            InteractionProcessStatus.Error or InteractionProcessStatus.Killed => "failed",
            _ => "drafting",
        };
    });
}
#endregion

// What the agent did: each tool call and its result. A long result is kept outside the run, so read it once.
#region steps
async Task<List<Step>> ToolCalls(InteractionProcess run, List<Step> known)
{
    var steps = new List<Step>();
    foreach (var call in run.Context.ToolCall)
    {
        var result = run.Context.ToolResult.FirstOrDefault(r => r.ToolCallId == call.ToolCallId);
        var output = result?.Result ?? known.Find(s => s.Id == call.ToolCallId)?.Output;
        if (result != null && output == null)
            output = (await mt.InteractionProcesses.GetToolResultAsync(run.Id, result.Sequence))?.Result;
        steps.Add(new Step(call.ToolCallId, call.FunctionName, call.ArgumentsJson, output,
            result?.IsError ?? false, result?.RejectionReason));
    }
    return steps;
}
#endregion

// 3. A person approves or rejects the refund the agent asked for (tutorial 10).
#region approval
app.MapPost("/api/tickets/{id}/{decision}", async (string id, string decision, DecisionRequest body) =>
{
    Ticket? ticket;
    lock (gate) ticket = desk.Tickets.Find(t => t.Id == id);
    var approval = ticket?.Approval;
    if (ticket?.RunId is not { } runId || approval == null || decision is not ("approve" or "reject"))
        return Error("This ticket isn't waiting for an approval.", 409);
    var approve = decision == "approve";
    var reason = string.IsNullOrWhiteSpace(body.Reason) ? "The support team said no." : body.Reason.Trim();
    // A second click finds nothing to decide.
    Update(ticket, t => { t.Approval = null; t.Decision = new Decision(approve, approve ? null : reason); t.Status = "drafting"; });
    try
    {
        if (approve) await mt.InteractionProcesses.ApproveToolCallAsync(runId, approval.Id);
        else await mt.InteractionProcesses.RejectToolCallAsync(runId, approval.Id, reason);
        return Results.Ok(ticket);
    }
    catch (Exception e)
    {
        Update(ticket, t => { t.Approval = approval; t.Decision = null; t.Status = "approval"; });
        return Error(e.Message, 502);
    }
});
#endregion

// 4. What the desk remembers about a ticket's customer: the threads of their memory (tutorial 20).
#region memory
app.MapGet("/api/tickets/{id}/memory", async (string id) =>
{
    string? loomId;
    lock (gate) loomId = desk.Tickets.Find(t => t.Id == id)?.LoomId;
    try
    {
        LoomThread[] threads = loomId == null ? [] : await mt.Looms.GetThreadsAsync(Guid.Parse(loomId),
            new ThreadListFilter { Sort = ThreadListOrder.Newest, Limit = 20 });
        return Results.Ok(new { threads = threads.Select(t => new { t.Content, kind = t.Kind.ToString(), created = t.DateCreated }) });
    }
    catch (Exception e)
    {
        return Error(e.Message, 502);
    }
});
#endregion

// 5. The nightly digest: the latest report the capsule wrote, and running it now (tutorials 16, 17 and 21).
#region digest
var digest = new DigestState(false, null);
async Task<string?> ReadReport(string path) =>
    await mt.VirtualFileSystems.ExistsFileByName("support-desk", ns, path)
        ? await mt.VirtualFileSystems.ReadTextByName("support-desk", ns, path)
        : null;

app.MapGet("/api/digest", async () =>
{
    try
    {
        var report = await ReadReport("/reports/latest.md");
        var counts = await ReadReport("/reports/latest.json");
        return Results.Ok(new { digest.Running, digest.Error, report, counts = counts == null ? (JsonElement?)null : JsonDocument.Parse(counts).RootElement });
    }
    catch (Exception e)
    {
        return Error(e.Message, 502);
    }
});

app.MapPost("/api/digest", async () =>
{
    try
    {
        var automation = await mt.AutomatedActions.GetByNameAsync(ns, "nightly-digest")
            ?? throw new InvalidOperationException("The nightly-digest automation is missing: run setup.cs first.");
        await mt.AutomatedActions.TriggerAsync(automation.Id);
        digest = new DigestState(true, null);
        Send("digest", digest);
        return Results.Json(digest, statusCode: 202);
    }
    catch (Exception e)
    {
        return Error(e.Message, 502);
    }
});

void DigestChanged(AppProcess run)
{
    if (run.TriggeredByAutomatedActionName != "nightly-digest") return;
    var ended = run.Status is AppProcessStatus.Finished or AppProcessStatus.Error or AppProcessStatus.Killed;
    digest = new DigestState(!ended, ended && run.Status != AppProcessStatus.Finished ? run.FailureDetails ?? run.Status.ToString() : null);
    Send("digest", digest);
}
#endregion

// Reset demo: forget the tickets and refunds. Maitento keeps its memories, reports and runs.
app.MapPost("/api/reset", () =>
{
    lock (gate)
    {
        desk = FreshDesk();
        Save();
    }
    Send("reset", new { });
    return Results.Ok(new { ok = true });
});

// 6. The shop API the desk's tools call. Maitento sends the shop-api-key secret in X-Api-Key (tutorial 9).
#region shop
var shop = app.MapGroup("/shop").AddEndpointFilter(async (context, next) =>
{
    var sent = Encoding.UTF8.GetBytes(context.HttpContext.Request.Headers["X-Api-Key"].ToString());
    return CryptographicOperations.FixedTimeEquals(sent, Encoding.UTF8.GetBytes(apiKey))
        ? await next(context)
        : Error("Unauthorised", 401);
});

shop.MapGet("/orders/{orderId}", (string orderId) =>
{
    lock (gate)
    {
        var order = desk.Orders.Find(o => o.Id == orderId);
        return order != null ? Results.Ok(order) : Error($"There is no order {orderId}", 404);
    }
});

shop.MapPost("/orders/{orderId}/refund", (string orderId, RefundRequest refund) =>
{
    lock (gate)
    {
        var order = desk.Orders.Find(o => o.Id == orderId);
        if (order == null) return Error($"There is no order {orderId}", 404);
        var refundable = order.Items.Sum(item => item.Price) - order.Refunded;
        if (refund.Amount <= 0 || refund.Amount > refundable)
            return Error($"You can refund between 0.01 and {refundable:0.00} {order.Currency}", 400);
        order.Refunded += refund.Amount;
        Save();
        Console.WriteLine($"Refunded {refund.Amount} {order.Currency} on {orderId}: {refund.Reason}");
        return Results.Ok(new { orderId, refunded = refund.Amount, totalRefunded = order.Refunded, currency = order.Currency });
    }
});

// The nightly-digest app asks for one day's tickets.
shop.MapGet("/tickets/{date}", (string date) =>
{
    lock (gate)
    {
        var tickets = desk.Tickets.Where(t => t.Created.StartsWith(date))
            .Select(t => new { t.Id, t.Customer, category = t.Triage?.Category, urgency = t.Triage?.Urgency, t.Status })
            .ToList();
        return Results.Ok(new { date, tickets });
    }
});
#endregion

Console.WriteLine($"Acme Coffee's support desk on http://localhost:{port}");
app.Run($"http://localhost:{port}");

record Desk(List<Ticket> Tickets, List<Order> Orders);

record Order(string Id, string Customer, string Email, string Status, string Currency, Item[] Items)
{
    public decimal Refunded { get; set; }
}

record Item(string Name, decimal Price);

record Triage(string Category, string Urgency, string? OrderId, string Summary);

record Step(string Id, string Tool, string Input, string? Output, bool Error, string? Rejection);

record Approval(Guid Id, string Tool, string Arguments);

record Decision(bool Approved, string? Reason);

record DigestState(bool Running, string? Error);

record NewTicket(string? Customer, string? Email, string? Subject, string? Message);

record DecisionRequest(string? Reason);

record RefundRequest(decimal Amount, string Reason);

class Ticket
{
    public required string Id { get; init; }
    public required string Customer { get; init; }
    public required string Email { get; init; }
    public string Subject { get; init; } = "";
    public required string Message { get; init; }
    public required string Created { get; init; }
    public string Status { get; set; } = "new";
    public Triage? Triage { get; set; }
    public Guid? RunId { get; set; }
    public string? LoomId { get; set; }
    public DateTime? Updated { get; set; }
    public Approval? Approval { get; set; }
    public Decision? Decision { get; set; }
    public List<Step> Steps { get; set; } = [];
    public string? Reply { get; set; }
    public string? Error { get; set; }
}
