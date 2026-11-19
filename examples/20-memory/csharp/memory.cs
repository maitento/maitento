#:package Maitento.Sdk@26.11.2

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
var userName = args.Length > 0 ? args[0] : "Ana";

// The interaction made one loom per person, named "<interaction>/<seat>/<input value>".
var ns = await mt.Namespaces.GetByNameAsync(mt.DefaultNamespace ?? "tutorials");
var loom = ns == null ? null
    : (await mt.Looms.GetByNamespaceAsync(ns.Id)).FirstOrDefault(l => l.Name == $"wren-chat/Wren/{userName}");
if (loom == null)
{
    Console.WriteLine($"Wren has no memory of {userName} yet.");
    return;
}

// region:threads
// Each thing Wren remembers is a thread.
Console.WriteLine($"Threads in {loom.Name}:");
foreach (var thread in await mt.Looms.GetThreadsAsync(loom.Id)) Console.WriteLine($"- [{thread.Kind}] {thread.Content}");
// endregion

// region:tapestry
// What Wren will wake up knowing in its next conversation with this person: the "What You Know" in its instructions.
var tapestry = await mt.Looms.GetTapestryAsync(loom.Id, [userName], "Wren");
Console.WriteLine($"\n{tapestry.Text}");
// endregion
