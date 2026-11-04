#:package Maitento.Sdk@26.11.1

using Maitento.Entities.Database;
using Maitento.Entities.Interactions;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// No stack named here: the interaction names its own. Run ../../csharp/customer.cs first, to make it.
var run = await mt.Interactions.RunAsync("summarise", new InteractionProcessStartRequest
{
    Inputs = [new NameValuePair("text", "The new dashboard loads twice as fast, though the export button moved and took a while to find.")],
});
Console.WriteLine(run.Output);
Console.WriteLine($"Ran on stack \"{run.CredentialStack?.StackName}\", chosen at the {run.CredentialStack?.Source}");
