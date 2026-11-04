#:package Maitento.Sdk@26.11.1

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
var ns = mt.DefaultNamespace ?? "tutorials";
var salesData = await mt.VirtualFileSystems.GetByNameAsync(ns, "sales-data")
    ?? throw new InvalidOperationException("Run the tutorial's sandbox.cs first: it creates the sales-data file system.");

// Upload the data and this folder's summarise.py, which adds revenue by region.
await mt.VirtualFileSystems.WriteTextById(salesData.Id, "/sales.csv", await File.ReadAllTextAsync("../data/sales.csv"));
await mt.VirtualFileSystems.WriteTextById(salesData.Id, "/summarise.py", await File.ReadAllTextAsync("summarise.py"));

await mt.DeployAsync("../maitento", ns);

var run = await mt.Capsules.RunAsync(ns, "sales-report");
Console.WriteLine($"Capsule finished: {run.Status}\n");
Console.WriteLine(await mt.VirtualFileSystems.ReadTextById(salesData.Id, "/report.md"));
