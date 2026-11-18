#:package Maitento.Sdk@26.10.0

using System.Text.Json;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// region:run
// An editor hands work to a writer and a fact checker, then signs off the newsletter.
var run = await mt.Interactions.RunAsync("newsletter", new Dictionary<string, string>
{
    ["topic"] = "why sleep matters",
});
// endregion

// region:log
// Each piece of work the editor handed out is a Dispatch call on the run. Its result is the member's reply.
foreach (var call in run.Context.ToolCall.Where(c => c.FunctionName == "Dispatch"))
{
    var arguments = JsonDocument.Parse(call.ArgumentsJson).RootElement;
    var agent = arguments.GetProperty("agent").GetString();
    Console.WriteLine($"Editor -> {agent}: {Cut(FirstLine(arguments.GetProperty("message").GetString()), 90)}");
    var result = run.Context.ToolResult.FirstOrDefault(r => r.ToolCallId == call.ToolCallId);
    if (result != null)
    {
        var reply = await mt.InteractionProcesses.GetToolResultAsync(run.Id, result.Sequence);
        Console.WriteLine($"  {Cut(FirstLine(reply?.Result), 100)}");
    }
}
Console.WriteLine($"\n{run.Output}");

static string FirstLine(string? text) =>
    (text ?? "").Split('\n').FirstOrDefault(line => line.Trim().Length > 0)?.TrimEnd() ?? "";

static string Cut(string text, int length) => text.Length <= length ? text : text[..length];
// endregion
