#:package Maitento.Sdk@26.11.1

using Maitento.Sdk;

// The challenge: a delete-note tool. Deploy the tutorial's project, then this folder's three files, which use its tools.
await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../../maitento");
await mt.DeployAsync("../maitento");

var ns = mt.DefaultNamespace!;
var notes = await mt.VirtualFileSystems.GetByNameAsync(ns, "notes")
    ?? await mt.VirtualFileSystems.CreateAsync(ns, "notes");
await mt.VirtualFileSystems.WriteTextById(notes.Id, "/old-ideas.md", "# Old ideas\n\n- a cat cafe\n");

var run = await mt.Interactions.RunAsync("tidy-notes", new Dictionary<string, string>
{
    ["request"] = "Delete my old ideas note.",
    ["notesVfsId"] = notes.Id.ToString(),
});
Console.WriteLine(run.Output);

Console.WriteLine($"\nDoes /old-ideas.md still exist? {await mt.VirtualFileSystems.ExistsFileById(notes.Id, "/old-ideas.md")}");
