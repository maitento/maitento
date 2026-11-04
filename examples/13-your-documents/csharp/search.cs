#:package Maitento.Sdk@26.11.1

using System.Text.RegularExpressions;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
var handbook = (await mt.Partitions.GetAllAsync()).FirstOrDefault(p => p.Name == "handbook" && !p.IsTemporary)
    ?? throw new InvalidOperationException("Run setup.cs first.");

var query = args.Length > 0 ? args[0] : "Can I take unused holiday into next year?";
Console.WriteLine($"Searching for: {query}\n");

// The closest match comes first. Each result is a passage, with the name of the file it came from.
var results = await mt.Files.SearchEmbeddingsAsync(handbook.Id, query);
for (var i = 0; i < results.Length; i++)
{
    var text = Regex.Replace(results[i].Text, @"\s+", " ");
    Console.WriteLine($"{i + 1}. {results[i].Name}: {text[..Math.Min(70, text.Length)]}…");
}
