#:package Maitento.Sdk@26.11.1

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();

// A knowledge base for the handbook. Maitento's API calls a knowledge base a partition.
var partitions = await mt.Partitions.GetAllAsync();
var handbook = partitions.FirstOrDefault(p => p.Name == "handbook" && !p.IsTemporary)
    ?? await mt.Partitions.CreateAsync("handbook");

// Upload each document. Maitento reads its text. Uploading the same file again keeps one copy.
foreach (var path in Directory.GetFiles("../knowledge").Order())
{
    var name = Path.GetFileName(path);
    await mt.Files.IngestFileAsync(handbook.Id, await File.ReadAllBytesAsync(path), name, "text/markdown");
    Console.WriteLine($"Uploaded {name}");
}

// Indexing turns each document into embeddings, in the background. Wait until every file can be searched.
for (var attempt = 1; ; attempt++)
{
    var files = (await mt.Partitions.GetFilesAsync(handbook.Id))?.Items ?? [];
    var waiting = files.Count(f => !f.IsVectorGenerated);
    if (files.Length > 0 && waiting == 0) break;
    if (attempt == 30)
    {
        // A file that can't be indexed until you act says why.
        var why = files.FirstOrDefault(f => f.IndexingFailure != null)?.IndexingFailure!.Message ?? "Indexing needs an OpenAI model key.";
        throw new InvalidOperationException($"{waiting} files are still not indexed after a minute. {why}");
    }
    await Task.Delay(2000);
}
Console.WriteLine($"The handbook is indexed. Knowledge base id: {handbook.Id}");
