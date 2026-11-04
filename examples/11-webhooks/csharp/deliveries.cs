#:package Maitento.Sdk@26.11.1

using Maitento.Sdk;

// The delivery log of the webhook you registered: one entry per update sent, newest first.
var url = Environment.GetEnvironmentVariable("WEBHOOK_URL");
if (string.IsNullOrEmpty(url))
    throw new InvalidOperationException("Set WEBHOOK_URL to the address you registered.");

await using var mt = MaitentoClient.CreateFromEnvironment();
var hook = (await mt.WebHooks.GetAllAsync()).FirstOrDefault(h => h.Url == url)
    ?? throw new InvalidOperationException($"No webhook is registered for {url}: run register first.");

foreach (var d in await mt.WebHooks.GetDeliveriesAsync(hook.Id, limit: 5) ?? [])
{
    var state = d.IsSent ? "delivered" : d.IsPermanentFailure ? "given up" : $"next try {d.NextAttemptTime:O}";
    Console.WriteLine($"run {d.AssociatedId}: {d.NumberAttempts} attempt(s), {state}");
    if (d.FailureDetails != null) Console.WriteLine($"  {d.FailureDetails}");
}
