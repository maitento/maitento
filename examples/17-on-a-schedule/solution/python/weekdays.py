import sys

from maitento import Maitento

# The challenge: run on weekdays only, at 09:30 UTC, instead of every day at 07:00.
mt = Maitento()
automation = mt.automations.find_by_name("daily-taglines")
if automation is None:
    sys.exit("Run the tutorial's schedule script first.")

for schedule in automation.schedules:
    automation = mt.automations.remove_schedule(automation.id, schedule.id)
automation = mt.automations.add_schedule(automation.id, name="weekday-mornings", minute="30", hour="9", day_of_week="1-5")

for s in automation.schedules:
    next_at = s.next_occurrence.isoformat() if s.next_occurrence else None
    print(f'{s.name}: "{s.minute} {s.hour} {s.day_of_month} {s.month} {s.day_of_week}" in UTC, next at {next_at}')
