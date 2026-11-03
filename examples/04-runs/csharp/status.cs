#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Interactions;
using Maitento.Sdk;

if (args.Length == 0) throw new ArgumentException("Pass the id of a run: dotnet run status.cs <run id>");
var id = Guid.Parse(args[0]);

await using var mt = MaitentoClient.CreateFromEnvironment();

// The run as it is right now.
var run = await mt.InteractionProcesses.GetInstanceAsync(id) ?? throw new ArgumentException($"There is no run {id}.");
Console.WriteLine($"Run {run.Id}: {run.Status}");

if (run.Status == InteractionProcessStatus.Finished)
{
    // Processes.GetByIdAsync gives a short summary of any kind of run, with the tokens it used.
    var tokens = (await mt.Processes.GetByIdAsync(id))?.Tokens;
    Console.WriteLine($"Worked for {run.ExecutionTime.TotalSeconds:F1}s, using {tokens?.Input} tokens in and {tokens?.Output} out.");
    Console.WriteLine(Opening(run.Output));
}
else if (run.Status is InteractionProcessStatus.Error or InteractionProcessStatus.Killed)
{
    Console.WriteLine($"It stopped: {run.FailureDetails}");
}

// The first 160 characters of the answer.
static string Opening(string? text) => text is null ? "" : $"{text[..Math.Min(160, text.Length)]}…";
