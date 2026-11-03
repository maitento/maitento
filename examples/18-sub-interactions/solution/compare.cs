#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Processes;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("./maitento");

// The lead researcher starts a country-facts and a country-dish run per country, all at once.
var run = await mt.Interactions.RunAsync("compare-countries", new Dictionary<string, string>
{
    ["countries"] = "Portugal, Japan, Kenya",
});
Console.WriteLine(run.Output);

Console.WriteLine($"\nSub-interactions of {run.Id}:");
var children = await mt.Processes.ListAsync(new ProcessListRequest { ParentProcessId = run.Id });
foreach (var summary in children.Items)
{
    var child = await mt.InteractionProcesses.GetInstanceAsync(summary.Id);
    var country = child?.Inputs.FirstOrDefault(input => input.Name == "country")?.Value;
    Console.WriteLine($"- {summary.DefinitionName} for {country}: {summary.Status}");
}
