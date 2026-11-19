#:package Maitento.Sdk@26.11.2

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();

// A virtual file system for the notes. It lives in your namespace, and its files stay until you delete them.
var ns = mt.DefaultNamespace!;
var notes = await mt.VirtualFileSystems.GetByNameAsync(ns, "notes")
    ?? await mt.VirtualFileSystems.CreateAsync(ns, "notes");

// Start from a fresh shopping list each time you run this.
await mt.VirtualFileSystems.WriteTextById(notes.Id, "/shopping.md", "# Shopping\n\n- milk\n- bread\n");

Console.WriteLine(await mt.VirtualFileSystems.ReadTextById(notes.Id, "/shopping.md"));
Console.WriteLine($"The notes file system is ready. Its id: {notes.Id}");
