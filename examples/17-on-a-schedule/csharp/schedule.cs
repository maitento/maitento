#:package Maitento.Sdk@26.11.1

using Maitento.Entities.AutomatedActions;
using Maitento.Entities.AutomatedActions.ProcessStartConfigs;
using Maitento.Entities.Core;
using Maitento.Entities.Database;
using Maitento.Sdk;

// This tutorial schedules the taglines app from tutorial 16, so deploy that project first.
await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../../16-apps/maitento");

// An action says what to start: the latest version of the taglines app, with its input.
var ns = mt.DefaultNamespace!;
var app = (await mt.Apps.GetByNameAsync(ns, "taglines"))!;
var latest = app.Versions.Max(v => v.Version);
AutomatedActionItem[] actions =
[
    new AutomatedActionItem
    {
        Name = "write-taglines",
        Config = new AppProcessStartConfig
        {
            Version = new VersionReference(app.Id, latest),
            Inputs = [new NameValuePair("product", "a reusable bamboo coffee cup")],
        },
    },
];

// Create the automation, or point an existing one at the app's latest version.
var existing = await mt.AutomatedActions.GetByNameAsync(ns, "daily-taglines");
var automation = existing != null
    ? await mt.AutomatedActions.UpdateAsync(existing.Id, "daily-taglines", "Fresh taglines every morning", actions)
    : await mt.AutomatedActions.CreateAsync(ns, "daily-taglines", "Fresh taglines every morning", actions);

// A schedule says when: here, every day at 07:00 UTC.
if (!automation.Schedules.Any(s => s.Name == "every-morning"))
{
    automation = await mt.AutomatedActions.AddScheduleAsync(automation.Id,
        new CronSchedule { Name = "every-morning", Minute = "0", Hour = "7" });
}
// The automation's next run is the soonest of its schedules' next occurrences.
Console.WriteLine($"{automation.Name} runs taglines version {latest}. Next run: {automation.NextScheduledRunAt:O}");
