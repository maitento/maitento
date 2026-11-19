#:package Maitento.Sdk@26.11.2

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();

// The capsule mounts the sales-data file system, so create it (and the namespace) before deploying.
var ns = mt.DefaultNamespace ?? "tutorials";
if (await mt.Namespaces.GetByNameAsync(ns) == null) await mt.Namespaces.CreateAsync(ns);
var salesData = await mt.VirtualFileSystems.GetByNameAsync(ns, "sales-data")
    ?? await mt.VirtualFileSystems.CreateAsync(ns, "sales-data");

foreach (var name in new[] { "sales.csv", "summarise.py" })
{
    var text = await File.ReadAllTextAsync($"../data/{name}");
    await mt.VirtualFileSystems.WriteTextById(salesData.Id, $"/{name}", text);
}

await mt.DeployAsync("../maitento", ns);

// Start the capsule and wait for it: it runs summarise.py and stops.
var run = await mt.Capsules.RunAsync(ns, "sales-report");
Console.WriteLine($"Capsule finished: {run.Status}\n");

Console.WriteLine(await mt.VirtualFileSystems.ReadTextById(salesData.Id, "/report.md"));
