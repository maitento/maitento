#:package Maitento.Sdk@26.11.1

using Maitento.Entities.AutomatedActions;
using Maitento.Entities.AutomatedActions.ProcessStartConfigs;
using Maitento.Entities.Core;
using Maitento.Entities.Database;
using Maitento.Entities.WebHooks;
using Maitento.Sdk;

// The key your app's API checks, and where Maitento sends run updates: your app's public URL + /maitento/webhook.
var apiKey = Environment.GetEnvironmentVariable("SHOP_API_KEY");
var webhookUrl = Environment.GetEnvironmentVariable("WEBHOOK_URL");
var webhookSecret = Environment.GetEnvironmentVariable("WEBHOOK_SECRET");
if (string.IsNullOrEmpty(apiKey) || string.IsNullOrEmpty(webhookUrl) || string.IsNullOrEmpty(webhookSecret))
    throw new InvalidOperationException("Set SHOP_API_KEY, WEBHOOK_URL and WEBHOOK_SECRET first.");

await using var mt = MaitentoClient.CreateFromEnvironment();
var ns = mt.DefaultNamespace ?? "tutorials";

// 1. The key the tools send to your app, kept as a secret (tutorial 9).
var secret = await mt.Secrets.GetByNameAsync("shop-api-key");
if (secret != null) await mt.Secrets.UpdateAsync(secret.Id, "shop-api-key", apiKey);
else await mt.Secrets.CreateAsync("shop-api-key", apiKey);

// 2. The desk's file system, with the report script in it. The capsule mounts it, so it must exist
//    before the deploy (tutorials 15 and 21).
if (await mt.Namespaces.GetByNameAsync(ns) == null) await mt.Namespaces.CreateAsync(ns);
var deskFiles = await mt.VirtualFileSystems.GetByNameAsync(ns, "support-desk")
    ?? await mt.VirtualFileSystems.CreateAsync(ns, "support-desk");
await mt.VirtualFileSystems.WriteTextById(deskFiles.Id, "/count_tickets.py", await File.ReadAllTextAsync("../data/count_tickets.py"));

// 3. The shop's policies in a knowledge base (tutorial 13), and a temporary one for web pages (tutorial 14).
var partitions = await mt.Partitions.GetAllAsync();
var policies = partitions.FirstOrDefault(p => p.Name == "shop-policies" && !p.IsTemporary)
    ?? await mt.Partitions.CreateAsync("shop-policies");
foreach (var file in Directory.GetFiles("../knowledge"))
    await mt.Files.IngestFileAsync(policies.Id, await File.ReadAllBytesAsync(file), Path.GetFileName(file), "text/markdown");
if (!partitions.Any(p => p.Name == "web-downloads" && p.IsTemporary))
    await mt.Partitions.CreateAsync("web-downloads", isTemporary: true, fileLifetimeHours: 24);

// 4. The agents, tools, app and capsule.
await mt.DeployAsync("../maitento", ns);

// 5. Maitento calls your app whenever an interaction run (a reply) or an app run (the digest) changes (tutorial 11).
var hooks = await mt.WebHooks.GetAllAsync();
foreach (var type in new[] { WebHookType.InteractionProcess, WebHookType.AppProcess })
{
    if (!hooks.Any(hook => hook.Url == webhookUrl && hook.Type == type))
        await mt.WebHooks.CreateAsync(type, webhookUrl, webhookSecret, []);
}

// 6. The nightly digest runs at 23:55 UTC (tutorial 17). An automation runs the app version it names,
//    so running setup again points it at the version just deployed.
var app = (await mt.Apps.GetByNameAsync(ns, "nightly-digest"))!;
var latest = app.Versions.Max(v => v.Version);
AutomatedActionItem[] actions =
[
    new AutomatedActionItem
    {
        Name = "write-digest",
        Config = new AppProcessStartConfig
        {
            Version = new VersionReference(app.Id, latest),
            Inputs = [new NameValuePair("namespaceName", ns)],
        },
    },
];
var existing = await mt.AutomatedActions.GetByNameAsync(ns, "nightly-digest");
var automation = existing != null
    ? await mt.AutomatedActions.UpdateAsync(existing.Id, "nightly-digest", "Counts the day's support tickets", actions)
    : await mt.AutomatedActions.CreateAsync(ns, "nightly-digest", "Counts the day's support tickets", actions);
if (!automation.Schedules.Any(s => s.Name == "every-night"))
{
    await mt.AutomatedActions.AddScheduleAsync(automation.Id,
        new CronSchedule { Name = "every-night", Minute = "55", Hour = "23" });
}

// The policies take a few seconds to index. Wait until the agent can search them.
while (true)
{
    var files = await mt.Partitions.GetFilesAsync(policies.Id);
    if (files != null && files.Items.Length > 0 && files.Items.All(f => f.IsVectorGenerated)) break;
    await Task.Delay(2000);
}
Console.WriteLine("The support desk is set up. Start the app with: dotnet run server.cs");
