import { Maitento, type CreateAutomatedActionRequest } from "@maitento/sdk";

// This tutorial schedules the taglines app from tutorial 16, so deploy that project first.
const mt = new Maitento();
await mt.deploy("../../16-apps/maitento");

// An action says what to start: the latest version of the taglines app, with its input.
const app = await mt.apps.getByName("taglines");
const latest = Math.max(...app.versions.map((v) => v.version));
const request: CreateAutomatedActionRequest = {
  name: "daily-taglines",
  description: "Fresh taglines every morning",
  actions: [{
    name: "write-taglines",
    config: { $type: "app", version: { id: app.id, version: latest }, inputs: [{ name: "product", value: "a reusable bamboo coffee cup" }] },
  }],
};

// Create the automation, or point an existing one at the app's latest version.
const existing = await mt.automations.findByName("daily-taglines");
let automation = existing ? await mt.automations.update(existing.id, request) : await mt.automations.create(request);

// A schedule says when: here, every day at 07:00 UTC.
if (!automation.schedules.some((s) => s.name === "every-morning")) {
  automation = await mt.automations.addSchedule(automation.id, { name: "every-morning", minute: "0", hour: "7" });
}
// The automation's next run is the soonest of its schedules' next occurrences.
console.log(`${automation.name} runs taglines version ${latest}. Next run: ${automation.nextScheduledRunAt?.toISOString()}`);
