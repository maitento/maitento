#:package Maitento.Sdk@26.10.0

using System.Text.Json;
using Maitento.Entities.CodePipelines.Process;
using Maitento.Entities.CodePipelines.WebApi;
using Maitento.Entities.Database;
using Maitento.Sdk;

var url = Environment.GetEnvironmentVariable("REPO_URL");
var credentials = Environment.GetEnvironmentVariable("REPO_CREDENTIALS");
if (string.IsNullOrEmpty(url) || string.IsNullOrEmpty(credentials))
    throw new InvalidOperationException("Set REPO_URL and REPO_CREDENTIALS first.");

var request = args.Length > 0 ? args[0] : "Add a --times option that prints the greeting that many times, with a test for it.";
var branch = args.Length > 1 ? args[1] : "maitento/times-with-docs";

await using var mt = MaitentoClient.CreateFromEnvironment();
// This folder's project: the tested-change-docs pipeline, whose hook adds a docs phase once the tests pass.
await mt.DeployAsync("./maitento");

var run = await mt.CodePipelines.RunAsync("tested-change-docs", new CodePipelineProcessStartRequest
{
    Inputs = [new NameValuePair("request", request)],
    Repos = [new CodePipelineGitHttpRepo { Name = "app", Url = url, Credentials = credentials, BranchSource = "main", BranchWork = branch }],
});

foreach (var phase in run.Phases)
{
    var steps = phase.Steps.Select(step => $"{step.AgentName} {step.StepName}{(step.DidCommit ? ", committed" : "")}");
    var decision = phase.HookPostOutput is { } hook
        ? $" -> {JsonDocument.Parse(hook).RootElement.GetProperty("decision").GetString()}"
        : "";
    Console.WriteLine($"{phase.PhaseName}: {phase.Status} ({string.Join("; ", steps)}){decision}");
}
Console.WriteLine($"\nPipeline {run.Status}. The work is on the {branch} branch.");
