#:package Maitento.Sdk@26.11.2

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// Ask your own question with: dotnet run helpdesk.cs -- "your question"
var question = args.Length > 0 ? args[0] : "What can I use instead of buttermilk in pancakes?";

// The router hands the question to the specialist whose subject fits.
var run = await mt.Interactions.RunAsync("ask-help-desk", new Dictionary<string, string> { ["question"] = question });

// Each choice the router made is kept on the run: which agent took the turn, and why.
foreach (var decision in run.RoutingDecisions)
{
    var chosen = await mt.Agents.GetByIdAsync(decision.Chosen.Id);
    var fallback = decision.IsFallback ? " (fallback)" : "";
    Console.WriteLine($"Router chose {chosen?.Name}{fallback}: {decision.Reason}\n");
}
Console.WriteLine(run.Output);
