import sys
import time

from maitento import Maitento

# Run tonight's digest now, instead of waiting for 23:55 UTC.
mt = Maitento()
automation = mt.automations.get_by_name("nightly-digest")
process_id = mt.automations.trigger(automation.id).process_id
print(f"Started the nightly-digest app: {process_id}")

# Follow the app run until it ends.
run = mt.app_runs.get(process_id)
while run.status not in ("Finished", "Error", "Killed"):
    time.sleep(2)
    run = mt.app_runs.get(process_id)
for line in run.console_outputs:
    print(line.text.rstrip())
if run.status != "Finished":
    sys.exit(f"The digest ended {run.status}: {run.failure_details}")

print(f"\n{run.return_value}\n")
print(mt.vfs.open("support-desk").read_text("/reports/latest.md"))
