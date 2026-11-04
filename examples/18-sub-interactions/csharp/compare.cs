#:package Maitento.Sdk@26.11.1

using Maitento.Entities.Processes;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// region:run
// The lead researcher starts one sub-interaction per country, in parallel, then compares the answers.
var run = await mt.Interactions.RunAsync("compare-countries", new Dictionary<string, string>
{
    ["countries"] = "Portugal, Japan, Kenya",
});
Console.WriteLine(run.Output);
// endregion

// region:lineage
// Every run the lead researcher started names this run as its parent.
Console.WriteLine($"\nSub-interactions of {run.Id}:");
var children = await mt.Processes.ListAsync(new ProcessListRequest { ParentProcessId = run.Id });
foreach (var summary in children.Items)
{
    var child = await mt.InteractionProcesses.GetInstanceAsync(summary.Id);
    var country = child?.Inputs.FirstOrDefault(input => input.Name == "country")?.Value;
    var why = summary.FailureSummary is { } failure ? $" ({failure})" : "";
    Console.WriteLine($"- {summary.DefinitionName} for {country}: {summary.Status}{why}");
}
// endregion
