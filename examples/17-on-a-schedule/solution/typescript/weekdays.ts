import { Maitento } from "@maitento/sdk";

// The challenge: run on weekdays only, at 09:30 UTC, instead of every day at 07:00.
const mt = new Maitento();
let automation = await mt.automations.findByName("daily-taglines");
if (!automation) throw new Error("Run the tutorial's schedule script first.");

for (const schedule of automation.schedules) automation = await mt.automations.removeSchedule(automation.id, schedule.id);
automation = await mt.automations.addSchedule(automation.id, { name: "weekday-mornings", minute: "30", hour: "9", dayOfWeek: "1-5" });

for (const s of automation.schedules) {
  console.log(`${s.name}: "${s.minute} ${s.hour} ${s.dayOfMonth} ${s.month} ${s.dayOfWeek}" in UTC, next at ${s.nextOccurrence?.toISOString()}`);
}
