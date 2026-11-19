#:package Maitento.Sdk@26.11.2

// Tutorial 4's challenge: start three runs at once, then wait for all of them.
using Maitento.Entities.Database;
using Maitento.Entities.Processes;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// StartAsync doesn't wait, so all three runs are handed to Maitento straight away.
string[] topics = ["why the sky is blue", "how bees make honey", "what a black hole is"];
var runs = await Task.WhenAll(topics.Select(topic =>
    mt.InteractionProcesses.StartAsync(mt.DefaultNamespace!, "explain", [new NameValuePair("topic", topic)])));
var ids = runs.Select(run => run.Id).ToArray();
Console.WriteLine($"Started {ids.Length} runs");

// One call reads all three: Processes.ListAsync with their ids. Say how many have ended whenever that changes.
var ended = 0;
while (ended < ids.Length)
{
    await Task.Delay(TimeSpan.FromSeconds(1));
    var page = await mt.Processes.ListAsync(new ProcessListRequest { Ids = string.Join(",", ids) });
    var now = page.Items.Count(run => run.State == ProcessState.Terminal);
    if (now != ended) Console.WriteLine($"{now} of {ids.Length} ended");
    ended = now;
}

for (var i = 0; i < ids.Length; i++)
{
    var run = (await mt.InteractionProcesses.GetInstanceAsync(ids[i]))!;
    Console.WriteLine($"{topics[i]}: {run.Status}, {run.Output?.Length ?? 0} characters");
}
