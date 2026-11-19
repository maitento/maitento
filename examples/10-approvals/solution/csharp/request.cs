#:package Maitento.Sdk@26.11.2

using Maitento.Entities.Database;
using Maitento.Sdk;

// Starts a refund request and returns at once. The run waits for a person in the approvals queue.
await using var mt = MaitentoClient.CreateFromEnvironment();
var message = "Hi, the tea sampler in order A-1001 was missing two of its teas. Could I get 5.00 back?";
var run = await mt.InteractionProcesses.StartAsync(mt.DefaultNamespace!, "support", [new NameValuePair("message", message)]);
Console.WriteLine($"Started run {run.Id}");
