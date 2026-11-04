#:package Maitento.Sdk@26.11.1

using Maitento.Entities.AutomatedActions;
using Maitento.Sdk;

// The challenge: run on weekdays only, at 09:30 UTC, instead of every day at 07:00.
await using var mt = MaitentoClient.CreateFromEnvironment();
var automation = await mt.AutomatedActions.GetByNameAsync(mt.DefaultNamespace!, "daily-taglines")
    ?? throw new InvalidOperationException("Run the tutorial's schedule script first.");

foreach (var schedule in automation.Schedules) automation = await mt.AutomatedActions.RemoveScheduleAsync(automation.Id, schedule.Id);
automation = await mt.AutomatedActions.AddScheduleAsync(automation.Id,
    new CronSchedule { Name = "weekday-mornings", Minute = "30", Hour = "9", DayOfWeek = "1-5" });

foreach (var s in automation.Schedules)
{
    Console.WriteLine($"{s.Name}: \"{s.Minute} {s.Hour} {s.DayOfMonth} {s.Month} {s.DayOfWeek}\" in UTC, next at {s.NextOccurrence:O}");
}
