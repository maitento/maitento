#:package Maitento.Sdk@26.11.1

using Maitento.Entities.Interactions;
using Maitento.Sdk;
using Maitento.Sdk.Runs;

await using var mt = MaitentoClient.CreateFromEnvironment();

// The tools send the orders-api-key secret that tutorial 9's setup stored, so it must exist before the deploy.
if (await mt.Secrets.GetByNameAsync("orders-api-key") == null)
    throw new InvalidOperationException("Run tutorial 9's setup first: it stores the orders-api-key secret.");
await mt.DeployAsync("../maitento");

string Ask(string prompt)
{
    Console.Write(prompt);
    return Console.ReadLine() ?? "";
}

var message = "Hi, order A-1001 arrived but the blue mug was smashed. Could I get a refund of 12.50 for it?";
Console.WriteLine($"Customer: {message}\n");

var inputs = new Dictionary<string, string> { ["message"] = message };
var run = await mt.Interactions.RunAsync("support", inputs, new RunOptions<InteractionProcess>
{
    // A refund needs your approval: the run waits with status PendingApproval until you decide.
    OnWaiting = async waiting =>
    {
        var approval = waiting.PendingApproval;
        if (waiting.Status != InteractionProcessStatus.PendingApproval || approval == null) return;

        Console.WriteLine($"The agent wants to call {approval.FunctionName} with {approval.ArgumentsJson}");
        var answer = Ask("Approve? (y/n) ");
        if (answer.Trim().StartsWith("y", StringComparison.OrdinalIgnoreCase))
        {
            await mt.InteractionProcesses.ApproveToolCallAsync(waiting.Id, approval.Id);
        }
        else
        {
            var reason = Ask("Why not? ");
            if (reason == "") reason = "Not approved";
            await mt.InteractionProcesses.RejectToolCallAsync(waiting.Id, approval.Id, reason);
        }
    },
});

Console.WriteLine($"\nSupport: {run.Output}");
