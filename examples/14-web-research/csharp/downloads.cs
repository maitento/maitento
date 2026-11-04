#:package Maitento.Sdk@26.11.1

using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
var downloads = (await mt.Partitions.GetAllAsync()).FirstOrDefault(p => p.Name == "web-downloads" && p.IsTemporary)
    ?? throw new InvalidOperationException("Run research.cs first.");

// The newest files first. Each one is a page an agent read, with the run that read it.
var page = await mt.Partitions.GetFilesAsync(downloads.Id, limit: 5);
foreach (var file in page?.Items ?? [])
{
    Console.WriteLine($"{file.WebSource?.Url}\n  read by run {file.WebSource?.ProcessId}, deleted after {file.ExpiresAt:O}");
}
