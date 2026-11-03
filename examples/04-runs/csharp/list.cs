#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Processes;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();

// Runs of every kind, newest first, a page at a time. Here: the runs in your namespace, five to a page.
var request = new ProcessListRequest { Namespace = [mt.DefaultNamespace!], Limit = 5 };
var page = await mt.Processes.ListAsync(request);
foreach (var run in page.Items) Show(run);

// The next page starts where this one ended: pass its cursor back. NextCursor is null after the last page.
if (page.NextCursor is not null)
{
    Console.WriteLine("--- next page");
    request.Cursor = page.NextCursor;
    foreach (var run in (await mt.Processes.ListAsync(request)).Items) Show(run);
}

// One line per run: when it started, what it ran, and how it is doing.
static void Show(ProcessSummary run) =>
    Console.WriteLine($"{run.DateCreated:yyyy-MM-ddTHH:mm:ss}  {run.DefinitionName}  {run.Status}");
