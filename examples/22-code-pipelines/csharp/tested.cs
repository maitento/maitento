#:package Maitento.Sdk@26.10.0

using System.Text.Json;
using Maitento.Entities.CodePipelines.Process;
using Maitento.Entities.CodePipelines.WebApi;
using Maitento.Entities.Database;
using Maitento.Sdk;

// The repository to work on, and credentials that can push to it, e.g. "x-access-token:<github token>".
var url = Environment.GetEnvironmentVariable("REPO_URL");
var credentials = Environment.GetEnvironmentVariable("REPO_CREDENTIALS");
if (string.IsNullOrEmpty(url) || string.IsNullOrEmpty(credentials))
    throw new InvalidOperationException("Set REPO_URL and REPO_CREDENTIALS first.");

// The change to make, and the branch to push it to.
var request = args.Length > 0 ? args[0] : "Add a --times option that prints the greeting that many times, with a test for it.";
var branch = args.Length > 1 ? args[1] : "maitento/add-times-option";

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

var run = await mt.CodePipelines.RunAsync("tested-change", new CodePipelineProcessStartRequest
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
            BranchWork = branch,
        },
    ],
});

// region:phases
// Every phase that ran, including the ones the hook added, and what its post hook decided.
foreach (var phase in run.Phases)
{
    var steps = phase.Steps.Select(step => $"{step.AgentName} {step.StepName}{(step.DidCommit ? ", committed" : "")}");
    var decision = phase.HookPostOutput is { } hook
        ? $" -> {JsonDocument.Parse(hook).RootElement.GetProperty("decision").GetString()}"
        : "";
    Console.WriteLine($"{phase.PhaseName}: {phase.Status} ({string.Join("; ", steps)}){decision}");
}

string? Variable(string name) => run.Variables?.FirstOrDefault(v => v.Name == name)?.Value;
Console.WriteLine($"\nTests passed: {Variable("testsPassed")}");
Console.WriteLine($"The last test report ends: {(Variable("testReport") ?? "").Trim().Split('\n').Last()}");
Console.WriteLine($"\nPipeline {run.Status}. The work is on the {branch} branch.");
// endregion
