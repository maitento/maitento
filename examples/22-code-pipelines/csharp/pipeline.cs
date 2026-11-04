#:package Maitento.Sdk@26.11.1

using Maitento.Entities.CodePipelines.Process;
using Maitento.Entities.CodePipelines.WebApi;
using Maitento.Entities.Database;
using Maitento.Sdk;

// The repository to work on, and credentials that can push to it, e.g. "x-access-token:<github token>".
var url = Environment.GetEnvironmentVariable("REPO_URL");
var credentials = Environment.GetEnvironmentVariable("REPO_CREDENTIALS");
if (string.IsNullOrEmpty(url) || string.IsNullOrEmpty(credentials))
    throw new InvalidOperationException("Set REPO_URL and REPO_CREDENTIALS first.");

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

var request = "Add a --shout flag that prints the greeting in capital letters, with a test for it.";
var run = await mt.CodePipelines.RunAsync("add-feature", new CodePipelineProcessStartRequest
{
    Inputs = [new NameValuePair("request", request)],
    Repos =
    [
        new CodePipelineGitHttpRepo
        {
            Name = "app",
            Url = url,
            Credentials = credentials,
            BranchSource = "main",
            BranchWork = "maitento/add-shout-flag",
        },
    ],
});
Console.WriteLine($"Pipeline {run.Status}. The work is on the maitento/add-shout-flag branch.\n");

var diff = await mt.CodePipelineProcesses.GetDiffRawAsync(run.Id);
Console.WriteLine(diff?.DiffRaw ?? "(no changes)");
