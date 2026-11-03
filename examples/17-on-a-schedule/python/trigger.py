import sys
import time

from maitento import Maitento

mt = Maitento()
automation = mt.automations.find_by_name("daily-taglines")
if automation is None:
    sys.exit("Run schedule.py first.")

# Run it now, instead of waiting for the schedule.
process_id = mt.automations.trigger(automation.id).process_id

# Every execution goes in the automation's history, newest first. Wait until this one has finished.
entry = mt.automations.history(automation.id, limit=1)[0]
for attempt in range(1, 60):
    if entry.process_id == process_id and entry.date_completed:
        break
    time.sleep(2)
    entry = mt.automations.history(automation.id, limit=1)[0]
error = f" ({entry.error_message})" if entry.error_message else ""
print(f"{entry.trigger_type} run {entry.process_id}: {entry.outcome}{error}")

# The run itself is an ordinary app run.
if entry.outcome == "Success":
    run = mt.app_runs.get(process_id)
    for line in run.console_outputs:
        print(line.text.rstrip())
