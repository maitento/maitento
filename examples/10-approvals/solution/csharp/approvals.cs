#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Processes;
using Maitento.Sdk;

// An approvals queue: every support run waiting for a person to approve a tool call, one at a time.
await using var mt = MaitentoClient.CreateFromEnvironment();

string Ask(string prompt)
{
    Console.Write(prompt);
    return Console.ReadLine() ?? "";
}

var waiting = await mt.Processes.ListAsync(new ProcessListRequest { Types = "Interaction", Statuses = "PendingApproval" });
foreach (var summary in waiting.Items.Where(s => s.DefinitionName == "support"))
{
    var run = await mt.InteractionProcesses.GetInstanceAsync(summary.Id);
    if (run?.PendingApproval is not { } approval) continue;

    Console.WriteLine($"Run {run.Id}: {approval.AgentName} wants to call {approval.FunctionName} with {approval.ArgumentsJson}");
    if (Ask("Approve? (y/n) ").Trim().StartsWith("y", StringComparison.OrdinalIgnoreCase))
    {
        await mt.InteractionProcesses.ApproveToolCallAsync(run.Id, approval.Id);
    }
    else
    {
        var reason = Ask("Why not? ");
        await mt.InteractionProcesses.RejectToolCallAsync(run.Id, approval.Id, reason == "" ? "Not approved" : reason);
    }
}
Console.WriteLine("Nothing else is waiting.");
