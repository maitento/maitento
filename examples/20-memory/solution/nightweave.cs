#:package Maitento.Sdk@26.11.1

using Maitento.Entities.Looms;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
var userName = args.Length > 0 ? args[0] : "Ana";

var ns = await mt.Namespaces.GetByNameAsync(mt.DefaultNamespace ?? "tutorials");
var loom = ns == null ? null
    : (await mt.Looms.GetByNamespaceAsync(ns.Id)).FirstOrDefault(l => l.Name == $"wren-chat/Wren/{userName}");
if (loom == null) throw new InvalidOperationException($"Wren has no memory of {userName} yet: talk to it first.");

// Ask for a night weave now, instead of waiting for five quiet minutes. It runs in the background.
var before = (await mt.Looms.GetNightWeavingsAsync(loom.Id, 1)).FirstOrDefault()?.Id;
await mt.Looms.RequestNightWeaveAsync(loom.Id);
Console.WriteLine("Night weaving…");

// Wait for the new night weaving to finish.
NightWeaving? night;
while (true)
{
    night = (await mt.Looms.GetNightWeavingsAsync(loom.Id, 1)).FirstOrDefault();
    if (night != null && night.Id != before && night.Status != NightWeavingStatus.Running) break;
    await Task.Delay(TimeSpan.FromSeconds(2));
}
var counts = night.Counts;
Console.WriteLine($"{night.Status}. Conversations: {counts.SessionsConsolidated}, threads merged: {counts.ThreadsMerged}, portraits: {counts.PanelsWoven}\n");

// The portrait night weaving wrote of each person, which Wren reads first when it next talks to them.
foreach (var panel in await mt.Looms.GetPanelsAsync(loom.Id)) Console.WriteLine($"## {panel.Subject}\n{panel.Text}\n");
