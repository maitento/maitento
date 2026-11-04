#:package Maitento.Sdk@26.11.1

using Maitento.Sdk;

// The challenge: the same assistant, over a second knowledge base. The project doesn't change.
await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../../maitento");

var itPolicies = (await mt.Partitions.GetAllAsync()).FirstOrDefault(p => p.Name == "it-policies" && !p.IsTemporary)
    ?? await mt.Partitions.CreateAsync("it-policies");
var content = await File.ReadAllBytesAsync("../knowledge/it-security.md");
await mt.Files.IngestFileAsync(itPolicies.Id, content, "it-security.md", "text/markdown");

// Wait until the document is indexed.
for (var attempt = 1; ; attempt++)
{
    var files = (await mt.Partitions.GetFilesAsync(itPolicies.Id))?.Items ?? [];
    if (files.Length > 0 && files.All(f => f.IsVectorGenerated)) break;
    if (attempt == 30) throw new InvalidOperationException("The document is still not indexed after a minute.");
    await Task.Delay(2000);
}

// The same interaction as before. Only the knowledge base in partitionId is different.
var run = await mt.Interactions.RunAsync("ask-handbook", new Dictionary<string, string>
{
    ["question"] = "How often do I have to change my password?",
    ["partitionId"] = itPolicies.Id.ToString(),
});
Console.WriteLine(run.Output);
