#:package Maitento.Sdk@26.11.2

using Maitento.Entities.Interactions;
using Maitento.Sdk;
using Maitento.Sdk.Runs;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// OnToken gets the story word by word, as it's written: RunAsync opens Maitento's live event stream for it.
var inputs = new Dictionary<string, string> { ["subject"] = "a hedgehog who is afraid of the dark" };
var run = await mt.Interactions.RunAsync("story", inputs, new RunOptions<InteractionProcess>
{
    OnToken = (text, agent) => Console.Write(text),
});

// The streamed text was for showing progress. The finished run is the record.
Console.WriteLine($"\n\n[{run.Status}: the output has {run.Output?.Length ?? 0} characters]");
