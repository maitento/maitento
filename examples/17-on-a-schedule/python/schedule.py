from maitento import Maitento

# This tutorial schedules the taglines app from tutorial 16, so deploy that project first.
mt = Maitento()
mt.deploy("../../16-apps/maitento")

# An action says what to start: the latest version of the taglines app, with its input.
app = mt.apps.get_by_name("taglines")
latest = max(v.version for v in app.versions)
request = {
    "name": "daily-taglines",
    "description": "Fresh taglines every morning",
    "actions": [{
        "name": "write-taglines",
        "config": {
            "$type": "app",
            "version": {"id": app.id, "version": latest},
            "inputs": [{"name": "product", "value": "a reusable bamboo coffee cup"}],
        },
    }],
}

# Create the automation, or point an existing one at the app's latest version.
existing = mt.automations.find_by_name("daily-taglines")
automation = mt.automations.update(existing.id, request) if existing else mt.automations.create(request)

# A schedule says when: here, every day at 07:00 UTC.
if not any(s.name == "every-morning" for s in automation.schedules):
    automation = mt.automations.add_schedule(automation.id, name="every-morning", minute="0", hour="7")
# The automation's next run is the soonest of its schedules' next occurrences.
next_run = automation.next_scheduled_run_at.isoformat() if automation.next_scheduled_run_at else None
print(f"{automation.name} runs taglines version {latest}. Next run: {next_run}")
