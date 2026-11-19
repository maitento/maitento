#:package Maitento.Sdk@26.11.2

using Maitento.Entities.WebHooks;
using Maitento.Sdk;

// Where Maitento should send interaction updates, and the secret it signs each one with.
var url = Environment.GetEnvironmentVariable("WEBHOOK_URL");
var secret = Environment.GetEnvironmentVariable("WEBHOOK_SECRET");
if (string.IsNullOrEmpty(url) || string.IsNullOrEmpty(secret))
    throw new InvalidOperationException("Set WEBHOOK_URL (your receiver's public address) and WEBHOOK_SECRET first.");

await using var mt = MaitentoClient.CreateFromEnvironment();
var hook = await mt.WebHooks.CreateAsync(WebHookType.InteractionProcess, url, secret, headers: []);
Console.WriteLine($"Webhook {hook.Id} registered: interaction updates will be sent to {url}");
