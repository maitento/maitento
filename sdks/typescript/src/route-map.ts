/**
 * Which SDK call reaches each public API route, for the docs and for the coverage test (test/route-map.test.ts
 * asserts this covers every `sdk: true` route of ../routes.json exactly). `npm run route-map` writes it to
 * route-map.json for the docs generator.
 *
 * `method` is `group.method` on a `Maitento` client; a VFS file operation is reached through a handle
 * (`vfs.open(name).readText`, `vfs.openById(id).readText`).
 */
export interface RouteMapEntry {
  /** `VERB /path`, exactly as in routes.json. */
  readonly route: string;
  /** The SDK call. */
  readonly method: string;
  /** One line of TypeScript that makes the call (`mt` is a `Maitento` client). */
  readonly example: string;
}

/** A public route the SDK deliberately does not wrap. */
export interface ExcludedRoute {
  readonly route: string;
  readonly reason: string;
}

const AGENT = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const APP = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
const APP_RUN = "6ecd8c99-4036-403d-bf84-cf8400f67836";
const AUTOMATION = "3d813cbb-47fb-42ba-91df-831e1593ac29";
const BUILD = "fdda765f-fc57-4604-a269-52a7df8164ec";
const CAPSULE = "a1a2a3a4-b1b2-4c1c-8d1d-e1e2e3e4e5e6";
const CAPSULE_RUN = "c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f";
const COMMAND = "d4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f70";
const CONNECTOR = "9b2f1c4e-6d3a-4e8b-a5c7-0f1e2d3c4b5a";
const CREDENTIAL = "6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c";
const CREDENTIAL_2 = "7a2e3d4c-5b6f-4071-9c8d-0e1f2a3b4c5d";
const CREDENTIAL_KEY = "3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7";
const CREDENTIAL_STACK = "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f";
const FILE = "52a1f6d8-3c7e-4b9a-8f2d-6e1c0b9a8d7f";
const INTERACTION = "0e7d9b3c-2f1a-4c5e-9d8b-7a6f5e4d3c2b";
const RUN = "e4c2a1b3-9d8f-4e7a-b6c5-d4e3f2a1b0c9";
const INVITE = "5f4e3d2c-1b0a-4987-8654-3210fedcba98";
const KEY = "8d7c6b5a-4f3e-4d2c-9b1a-0f9e8d7c6b5a";
const LOOM = "2c9a7e5b-3d1f-4a8c-b6e4-9f0d2c1b3a5e";
const THREAD = "7a5c3e1f-9b8d-4c6a-8e2f-1d3b5a7c9e0f";
const TENSION = "4b6d8f0a-2c4e-4a6b-9c8d-0e1f2a3b4c5d";
const NAMESPACE = "b5f3d1a9-7e6c-4b4a-9a2e-8c0d1f3e5a7b";
const PARTITION = "d6e5f4a3-b2c1-4d0e-9f8a-7b6c5d4e3f2a";
const PIPELINE = "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b";
const PIPELINE_RUN = "aa11bb22-cc33-4d44-8e55-ff6677889900";
const SECRET = "c0ffee00-1234-4abc-9def-0123456789ab";
const SIGN_IN = "9e8d7c6b-5a4f-4e3d-b2c1-a0f9e8d7c6b5";
const TOOL = "1f2e3d4c-5b6a-4798-8a9b-cdef01234567";
const USER = "b814ac02-0000-4000-8000-000000000001";
const VFS = "e9d8c7b6-a5f4-4e3d-8c2b-1a0f9e8d7c6b";
const WEBHOOK = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

const q = (value: string): string => JSON.stringify(value);

export const ROUTE_MAP: readonly RouteMapEntry[] = [
  // Agents
  { route: "GET /agents", method: "agents.list", example: "const agents = await mt.agents.list();" },
  { route: "DELETE /agents/by-id/{id}", method: "agents.delete", example: `await mt.agents.delete(${q(AGENT)});` },
  { route: "GET /agents/by-id/{id}", method: "agents.get", example: `const agent = await mt.agents.get(${q(AGENT)});` },
  {
    route: "PUT /agents/by-id/{id}",
    method: "agents.update",
    example: `const agent = await mt.agents.update(${q(AGENT)}, { name: "greeter", aiModelId: "2f0c8b9e-6a4d-4c3b-9e1f-7d5a3c1b9e2f", systemPrompt: "You are warm and brief.", summaryForOtherAgents: "Says hello" });`,
  },
  { route: "GET /ai-models", method: "models.list", example: "const models = await mt.models.list();" },

  // Apps
  { route: "GET /apps", method: "apps.list", example: "const apps = await mt.apps.list();" },
  { route: "DELETE /apps/by-id/{id}", method: "apps.delete", example: `await mt.apps.delete(${q(APP)});` },
  { route: "GET /apps/by-id/{id}", method: "apps.get", example: `const app = await mt.apps.get(${q(APP)});` },
  {
    route: "PUT /apps/by-id/{id}/versions/{versionNumber}/start",
    method: "apps.start",
    example: `const run = await mt.apps.start({ id: ${q(APP)}, version: 3 }, { inputs: { customerId: "C-1042" } });`,
  },
  { route: "GET /apps/processes/by-id/{id}", method: "appRuns.get", example: `const run = await mt.appRuns.get(${q(APP_RUN)});` },
  {
    route: "PUT /apps/processes/by-id/{id}/inputs",
    method: "appRuns.updateInputs",
    example: `const run = await mt.appRuns.updateInputs(${q(APP_RUN)}, { inputs: { approved: true } });`,
  },

  // Authentication (used by the client itself)
  {
    route: "PUT /auth",
    method: "new Maitento({ email, password })",
    example: 'const mt = new Maitento({ email: "ada@example.com", password: process.env.MAITENTO_PASSWORD });',
  },
  {
    route: "GET /auth/renew",
    method: "new Maitento({ token })",
    example: "const mt = new Maitento({ token: jwt }); // renewed automatically at 80% of its lifetime",
  },

  // Automations
  { route: "GET /automated-actions", method: "automations.list", example: "const automations = await mt.automations.list();" },
  {
    route: "DELETE /automated-actions/by-id/{id}",
    method: "automations.delete",
    example: `await mt.automations.delete(${q(AUTOMATION)});`,
  },
  {
    route: "GET /automated-actions/by-id/{id}",
    method: "automations.get",
    example: `const automation = await mt.automations.get(${q(AUTOMATION)});`,
  },
  {
    route: "PUT /automated-actions/by-id/{id}",
    method: "automations.update",
    example: `const automation = await mt.automations.update(${q(AUTOMATION)}, { name: "nightly-digest", description: "Summarise the day" });`,
  },
  {
    route: "GET /automated-actions/by-id/{id}/history",
    method: "automations.history",
    example: `const history = await mt.automations.history(${q(AUTOMATION)}, { limit: 20 });`,
  },
  {
    route: "POST /automated-actions/by-id/{id}/message-triggers",
    method: "automations.addMessageTrigger",
    example: `await mt.automations.addMessageTrigger(${q(AUTOMATION)}, { triggerType: "InteractionProcessUpdated", eventFilter: "$[?(@.status == 'Finished')]" });`,
  },
  {
    route: "DELETE /automated-actions/by-id/{id}/message-triggers/{triggerId}",
    method: "automations.removeMessageTrigger",
    example: `await mt.automations.removeMessageTrigger(${q(AUTOMATION)}, "4c1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f");`,
  },
  {
    route: "PUT /automated-actions/by-id/{id}/message-triggers/{triggerId}",
    method: "automations.updateMessageTrigger",
    example: `await mt.automations.updateMessageTrigger(${q(AUTOMATION)}, "4c1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f", { triggerType: "AppProcessUpdated" });`,
  },
  {
    route: "POST /automated-actions/by-id/{id}/message-triggers/{triggerId}/disable",
    method: "automations.disableMessageTrigger",
    example: `await mt.automations.disableMessageTrigger(${q(AUTOMATION)}, "4c1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f");`,
  },
  {
    route: "POST /automated-actions/by-id/{id}/message-triggers/{triggerId}/enable",
    method: "automations.enableMessageTrigger",
    example: `await mt.automations.enableMessageTrigger(${q(AUTOMATION)}, "4c1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f");`,
  },
  {
    route: "POST /automated-actions/by-id/{id}/schedules",
    method: "automations.addSchedule",
    example: `await mt.automations.addSchedule(${q(AUTOMATION)}, { name: "weekdays-9am", minute: "0", hour: "9", dayOfWeek: "1-5" });`,
  },
  {
    route: "DELETE /automated-actions/by-id/{id}/schedules/{scheduleId}",
    method: "automations.removeSchedule",
    example: `await mt.automations.removeSchedule(${q(AUTOMATION)}, "8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b");`,
  },
  {
    route: "PUT /automated-actions/by-id/{id}/schedules/{scheduleId}",
    method: "automations.updateSchedule",
    example: `await mt.automations.updateSchedule(${q(AUTOMATION)}, "8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b", { minute: "30", hour: "8" });`,
  },
  {
    route: "POST /automated-actions/by-id/{id}/schedules/{scheduleId}/disable",
    method: "automations.disableSchedule",
    example: `await mt.automations.disableSchedule(${q(AUTOMATION)}, "8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b");`,
  },
  {
    route: "POST /automated-actions/by-id/{id}/schedules/{scheduleId}/enable",
    method: "automations.enableSchedule",
    example: `await mt.automations.enableSchedule(${q(AUTOMATION)}, "8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b");`,
  },
  {
    route: "POST /automated-actions/by-id/{id}/trigger",
    method: "automations.trigger",
    example: `const { processId } = await mt.automations.trigger(${q(AUTOMATION)});`,
  },

  // Builds
  {
    route: "GET /builds",
    method: "builds.list",
    example: 'for await (const build of mt.builds.list({ namespaces: ["demo", "support"], outcome: "Failed" })) console.log(build.id);',
  },
  { route: "DELETE /builds/by-id/{id}", method: "builds.delete", example: `await mt.builds.delete(${q(BUILD)});` },
  { route: "GET /builds/by-id/{id}", method: "builds.get", example: `const build = await mt.builds.get(${q(BUILD)});` },

  // Capsule runs
  { route: "GET /capsule-processes", method: "capsuleRuns.list", example: "const runs = await mt.capsuleRuns.list();" },
  {
    route: "GET /capsule-processes/by-id/{id}",
    method: "capsuleRuns.get",
    example: `const run = await mt.capsuleRuns.get(${q(CAPSULE_RUN)});`,
  },
  {
    route: "POST /capsule-processes/by-id/{id}/commands",
    method: "capsuleRuns.exec",
    example: `const command = await mt.capsuleRuns.exec(${q(CAPSULE_RUN)}, { command: "python3", arguments: ["report.py"] }); // or mt.capsuleRuns.execAndWait(...)`,
  },
  {
    route: "GET /capsule-processes/by-id/{id}/commands/{commandId}",
    method: "capsuleRuns.getCommand",
    example: `const command = await mt.capsuleRuns.getCommand(${q(CAPSULE_RUN)}, ${q(COMMAND)});`,
  },
  {
    route: "POST /capsule-processes/by-id/{id}/mounts/secrets",
    method: "capsuleRuns.mountSecret",
    example: `await mt.capsuleRuns.mountSecret(${q(CAPSULE_RUN)}, { secretName: "github-token", mountName: "github" });`,
  },
  {
    route: "DELETE /capsule-processes/by-id/{id}/mounts/secrets/{mountName}",
    method: "capsuleRuns.unmountSecret",
    example: `await mt.capsuleRuns.unmountSecret(${q(CAPSULE_RUN)}, "github");`,
  },
  {
    route: "POST /capsule-processes/by-id/{id}/mounts/vfs",
    method: "capsuleRuns.mountVfs",
    example: `await mt.capsuleRuns.mountVfs(${q(CAPSULE_RUN)}, { vfsId: ${q(VFS)}, vfsNamespaceId: ${q(NAMESPACE)}, mountName: "workspace" });`,
  },
  {
    route: "DELETE /capsule-processes/by-id/{id}/mounts/vfs/{mountName}",
    method: "capsuleRuns.unmountVfs",
    example: `await mt.capsuleRuns.unmountVfs(${q(CAPSULE_RUN)}, "workspace");`,
  },
  {
    route: "POST /capsule-processes/by-id/{id}/packages",
    method: "capsuleRuns.installPackage",
    example: `await mt.capsuleRuns.installPackage(${q(CAPSULE_RUN)}, { packageName: "jq" });`,
  },
  {
    route: "DELETE /capsule-processes/by-id/{id}/packages/{packageName}",
    method: "capsuleRuns.removePackage",
    example: `await mt.capsuleRuns.removePackage(${q(CAPSULE_RUN)}, "jq");`,
  },
  {
    route: "POST /capsule-processes/by-id/{id}/terminate",
    method: "capsuleRuns.terminate",
    example: `await mt.capsuleRuns.terminate(${q(CAPSULE_RUN)});`,
  },
  {
    route: "POST /capsule-processes/by-id/{id}/users",
    method: "capsuleRuns.addUser",
    example: `await mt.capsuleRuns.addUser(${q(CAPSULE_RUN)}, { username: "analyst", sudoAsUsers: [] });`,
  },
  {
    route: "DELETE /capsule-processes/by-id/{id}/users/{username}",
    method: "capsuleRuns.removeUser",
    example: `await mt.capsuleRuns.removeUser(${q(CAPSULE_RUN)}, "analyst");`,
  },

  // Capsules
  { route: "GET /capsules", method: "capsules.list", example: "const capsules = await mt.capsules.list();" },
  { route: "DELETE /capsules/by-id/{id}", method: "capsules.delete", example: `await mt.capsules.delete(${q(CAPSULE)});` },
  { route: "GET /capsules/by-id/{id}", method: "capsules.get", example: `const capsule = await mt.capsules.get(${q(CAPSULE)});` },
  {
    route: "PUT /capsules/by-id/{id}/versions/{versionNumber}/start",
    method: "capsules.start",
    example: `const run = await mt.capsules.start({ id: ${q(CAPSULE)}, version: 2 });`,
  },

  // Code pipelines
  { route: "GET /code-pipelines", method: "pipelines.list", example: "const pipelines = await mt.pipelines.list();" },
  { route: "DELETE /code-pipelines/by-id/{id}", method: "pipelines.delete", example: `await mt.pipelines.delete(${q(PIPELINE)});` },
  { route: "GET /code-pipelines/by-id/{id}", method: "pipelines.get", example: `const pipeline = await mt.pipelines.get(${q(PIPELINE)});` },
  {
    route: "PUT /code-pipelines/by-id/{id}",
    method: "pipelines.update",
    example: `const pipeline = await mt.pipelines.update(${q(PIPELINE)}, { ...definition, name: "fix-bug" });`,
  },
  { route: "GET /code-pipelines/processes", method: "pipelineRuns.list", example: "const runs = await mt.pipelineRuns.list();" },
  {
    route: "GET /code-pipelines/processes/alive",
    method: "pipelineRuns.listActive",
    example: "const active = await mt.pipelineRuns.listActive();",
  },
  {
    route: "GET /code-pipelines/processes/by-id/{id}",
    method: "pipelineRuns.get",
    example: `const run = await mt.pipelineRuns.get(${q(PIPELINE_RUN)});`,
  },
  {
    route: "POST /code-pipelines/processes/by-id/{id}/answer",
    method: "pipelineRuns.answer",
    example: `await mt.pipelineRuns.answer(${q(PIPELINE_RUN)}, { requestId: "3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7", answer: "Use the v2 API." });`,
  },
  {
    route: "PUT /code-pipelines/processes/by-id/{id}/credentials",
    method: "pipelineRuns.updateCredentials",
    example: `await mt.pipelineRuns.updateCredentials(${q(PIPELINE_RUN)}, [{ type: "apiKey", engine: "Codex", apiKey: process.env.OPENAI_API_KEY!, isOwnLicense: true }]);`,
  },
  {
    route: "GET /code-pipelines/processes/by-id/{id}/diff",
    method: "pipelineRuns.diff",
    example: `const diff = await mt.pipelineRuns.diff(${q(PIPELINE_RUN)});`,
  },
  {
    route: "GET /code-pipelines/processes/by-id/{id}/diff/raw",
    method: "pipelineRuns.rawDiff",
    example: `const raw = await mt.pipelineRuns.rawDiff(${q(PIPELINE_RUN)});`,
  },
  {
    route: "PUT /code-pipelines/processes/by-id/{id}/kill",
    method: "pipelineRuns.kill",
    example: `await mt.pipelineRuns.kill(${q(PIPELINE_RUN)});`,
  },
  {
    route: "POST /code-pipelines/processes/by-id/{id}/payloads/by-ids",
    method: "pipelineRuns.payloads",
    example: `const payloads = await mt.pipelineRuns.payloads(${q(PIPELINE_RUN)}, { toolUseIds: ["6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d"], contextEntryIds: [] });`,
  },
  {
    route: "GET /code-pipelines/processes/by-id/{id}/payloads/steps/{stepExecutionId}",
    method: "pipelineRuns.stepPayloads",
    example: `const payloads = await mt.pipelineRuns.stepPayloads(${q(PIPELINE_RUN)}, "5d6e7f80-91a2-4b3c-8d4e-5f60718293a4");`,
  },
  {
    route: "PUT /code-pipelines/processes/by-id/{id}/repos",
    method: "pipelineRuns.updateRepos",
    example: `await mt.pipelineRuns.updateRepos(${q(PIPELINE_RUN)}, [{ type: "http", name: "app", url: "https://github.com/acme/app.git", credentials: process.env.GIT_TOKEN!, branchSource: "main", branchWork: "fix/login" }]);`,
  },
  {
    route: "PUT /code-pipelines/processes/by-id/{id}/restart",
    method: "pipelineRuns.restart",
    example: `const next = await mt.pipelineRuns.restart(${q(PIPELINE_RUN)});`,
  },
  {
    route: "PUT /code-pipelines/processes/by-id/{id}/resume",
    method: "pipelineRuns.resume",
    example: `await mt.pipelineRuns.resume(${q(PIPELINE_RUN)});`,
  },
  {
    route: "PUT /code-pipelines/processes/by-id/{id}/resume-with-prompt",
    method: "pipelineRuns.resumeWithPrompt",
    example: `await mt.pipelineRuns.resumeWithPrompt(${q(PIPELINE_RUN)}, { continuationPrompt: "Also add a regression test." });`,
  },
  {
    route: "PUT /code-pipelines/processes/by-id/{id}/start",
    method: "pipelines.start",
    example: `const run = await mt.pipelines.start({ id: ${q(PIPELINE)} }, { inputs: { issue: "Login fails on Safari" }, repos });`,
  },

  // Connectors
  { route: "GET /connectors", method: "connectors.list", example: "const connectors = await mt.connectors.list();" },
  { route: "DELETE /connectors/by-id/{id}", method: "connectors.delete", example: `await mt.connectors.delete(${q(CONNECTOR)});` },
  { route: "GET /connectors/by-id/{id}", method: "connectors.get", example: `const connector = await mt.connectors.get(${q(CONNECTOR)});` },
  {
    route: "POST /connectors/by-id/{id}/versions/{version}/disable",
    method: "connectors.disableVersion",
    example: `await mt.connectors.disableVersion(${q(CONNECTOR)}, 2);`,
  },
  {
    route: "POST /connectors/by-id/{id}/versions/{version}/enable",
    method: "connectors.enableVersion",
    example: `await mt.connectors.enableVersion(${q(CONNECTOR)}, 2);`,
  },

  // Tools (external operations)
  { route: "GET /external-operations", method: "tools.list", example: "const tools = await mt.tools.list();" },
  { route: "DELETE /external-operations/by-id/{id}", method: "tools.delete", example: `await mt.tools.delete(${q(TOOL)});` },
  { route: "GET /external-operations/by-id/{id}", method: "tools.get", example: `const tool = await mt.tools.get(${q(TOOL)});` },
  {
    route: "POST /external-operations/by-id/{id}/versions/{version}/disable",
    method: "tools.disableVersion",
    example: `await mt.tools.disableVersion(${q(TOOL)}, 1);`,
  },
  {
    route: "POST /external-operations/by-id/{id}/versions/{version}/enable",
    method: "tools.enableVersion",
    example: `await mt.tools.enableVersion(${q(TOOL)}, 1);`,
  },

  // Credential stacks
  { route: "GET /credential-stacks", method: "credentialStacks.list", example: "const stacks = await mt.credentialStacks.list();" },
  {
    route: "POST /credential-stacks",
    method: "credentialStacks.create",
    example: `const stack = await mt.credentialStacks.create({ name: "production", entries: [{ credentialId: ${q(CREDENTIAL)} }, { credentialId: ${q(CREDENTIAL_2)}, allowedEndpointKinds: ["Foundry"] }] });`,
  },
  {
    route: "DELETE /credential-stacks/by-id/{id}",
    method: "credentialStacks.delete",
    example: `await mt.credentialStacks.delete(${q(CREDENTIAL_STACK)});`,
  },
  {
    route: "GET /credential-stacks/by-id/{id}",
    method: "credentialStacks.get",
    example: `const stack = await mt.credentialStacks.get(${q(CREDENTIAL_STACK)});`,
  },
  {
    route: "GET /credential-stacks/by-id/{id}/usage",
    method: "credentialStacks.usage",
    example: `const { tenantDefault, namespaces, partitions } = await mt.credentialStacks.usage(${q(CREDENTIAL_STACK)});`,
  },
  {
    route: "GET /credential-stacks/by-name/{name}",
    method: "credentialStacks.findByName",
    example: `const stack = await mt.credentialStacks.findByName("production"); // null when there's none`,
  },
  {
    route: "PUT /credential-stacks/by-id/{id}",
    method: "credentialStacks.update",
    example: `await mt.credentialStacks.update(${q(CREDENTIAL_STACK)}, { name: "production", entries: [{ credentialId: ${q(CREDENTIAL)}, allowedModels: ["gpt-5"] }, { credentialId: ${q(CREDENTIAL_2)}, enabled: false }] });`,
  },

  // Credentials
  { route: "DELETE /credentials", method: "credentials.deleteByTag", example: 'const deleted = await mt.credentials.deleteByTag("customer-42");' },
  { route: "GET /credentials", method: "credentials.list", example: 'const credentials = await mt.credentials.list({ tag: "customer-42" });' },
  {
    route: "POST /credentials",
    method: "credentials.create",
    example: 'const credential = await mt.credentials.create({ name: "openai-production", provider: "OpenAi", keys: [{ value: process.env.OPENAI_API_KEY! }], models: [{ model: "gpt-5" }] });',
  },
  { route: "DELETE /credentials/by-id/{id}", method: "credentials.delete", example: `await mt.credentials.delete(${q(CREDENTIAL)});` },
  { route: "GET /credentials/by-id/{id}", method: "credentials.get", example: `const credential = await mt.credentials.get(${q(CREDENTIAL)});` },
  {
    route: "PUT /credentials/by-id/{id}",
    method: "credentials.update",
    example: `await mt.credentials.update(${q(CREDENTIAL)}, { name: "openai-production", provider: "OpenAi", keys: [{ id: ${q(CREDENTIAL_KEY)} }, { value: process.env.OPENAI_API_KEY_NEW! }] });`,
  },
  {
    route: "POST /credentials/by-id/{id}/test",
    method: "credentials.test",
    example: `const { succeeded, errorCode } = await mt.credentials.test(${q(CREDENTIAL)});`,
  },
  {
    route: "POST /credentials/test",
    method: "credentials.testUnsaved",
    example: 'const { succeeded } = await mt.credentials.testUnsaved({ name: "openai-production", provider: "OpenAi", keys: [{ value: process.env.OPENAI_API_KEY! }] });',
  },
  {
    route: "POST /credentials/sign-in/{tool}",
    method: "credentials.startSignIn",
    example: 'const { signInId, verificationUrl, userCode, pollIntervalSeconds } = await mt.credentials.startSignIn("Codex");',
  },
  {
    route: "POST /credentials/sign-in/{tool}/finish",
    method: "credentials.finishSignIn",
    example: `const { status, credential } = await mt.credentials.finishSignIn("Codex", { signInId: ${q(SIGN_IN)}, name: "team-chatgpt" });`,
  },
  {
    route: "POST /credentials/sign-in-tokens",
    method: "credentials.importSignIn",
    example: `const credential = await mt.credentials.importSignIn({ tool: "Claude", accessToken, refreshToken, expiresAtUtc, name: "acme-claude-max" });`,
  },
  {
    route: "PUT /credentials/by-id/{id}/sign-in-tokens",
    method: "credentials.replaceSignInTokens",
    example: `await mt.credentials.replaceSignInTokens(${q(CREDENTIAL)}, { tool: "Claude", accessToken, refreshToken, expiresAtUtc });`,
  },

  // Files
  {
    route: "GET /files/by-checksum/{checksum}",
    method: "files.findByChecksum",
    example: 'const existing = await mt.files.findByChecksum("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08");',
  },
  { route: "DELETE /files/by-id/{id}", method: "files.delete", example: `await mt.files.delete(${q(FILE)});` },
  { route: "GET /files/by-id/{id}", method: "files.download", example: `const { bytes, contentType } = await mt.files.download(${q(FILE)});` },
  {
    route: "PATCH /files/by-id/{id}",
    method: "files.replace",
    example: `const file = await mt.files.replace(${q(FILE)}, "./handbook-v2.pdf");`,
  },
  { route: "GET /files/by-id/{id}/details", method: "files.get", example: `const file = await mt.files.get(${q(FILE)});` },
  { route: "GET /files/by-id/{id}/text", method: "files.text", example: `const text = await mt.files.text(${q(FILE)});` },
  {
    route: "PUT /files/embeddings/search",
    method: "files.search",
    example: `const hits = await mt.files.search({ partitionId: ${q(PARTITION)}, query: "refund policy for damaged goods" });`,
  },
  {
    route: "PUT /files/partitions/{partitionId}",
    method: "files.upload",
    example: `const file = await mt.files.upload(${q(PARTITION)}, "./handbook.pdf");`,
  },

  // Interactions
  { route: "GET /interactions", method: "interactions.list", example: "const interactions = await mt.interactions.list();" },
  {
    route: "DELETE /interactions/by-id/{id}",
    method: "interactions.delete",
    example: `await mt.interactions.delete(${q(INTERACTION)});`,
  },
  {
    route: "GET /interactions/by-id/{id}",
    method: "interactions.get",
    example: `const interaction = await mt.interactions.get(${q(INTERACTION)});`,
  },
  {
    route: "PUT /interactions/managed/by-id/{id}",
    method: "interactions.updateManaged",
    example: `await mt.interactions.updateManaged(${q(INTERACTION)}, { ...definition, maxDispatches: 12 });`,
  },
  {
    route: "PUT /interactions/one-shot/by-id/{id}",
    method: "interactions.updateOneShot",
    example: `await mt.interactions.updateOneShot(${q(INTERACTION)}, { ...definition, prompt: "Say hello in French." });`,
  },
  {
    route: "GET /interactions/processes",
    method: "interactionRuns.list",
    example: "const everyRun = await mt.interactionRuns.list(); // unbounded: prefer mt.runs.list()",
  },
  {
    route: "GET /interactions/processes/by-id/{id}",
    method: "interactionRuns.get",
    example: `const run = await mt.interactionRuns.get(${q(RUN)});`,
  },
  {
    route: "POST /interactions/processes/by-id/{id}/add-message",
    method: "interactionRuns.addMessage",
    example: `const { queued } = await mt.interactionRuns.addMessage(${q(RUN)}, { message: "Make it shorter, please." });`,
  },
  {
    route: "POST /interactions/processes/by-id/{id}/approve",
    method: "interactionRuns.approve",
    example: `await mt.interactionRuns.approve(${q(RUN)}, { approvalId: run.pendingApproval!.id });`,
  },
  {
    route: "POST /interactions/processes/by-id/{id}/reject",
    method: "interactionRuns.reject",
    example: `await mt.interactionRuns.reject(${q(RUN)}, { approvalId: run.pendingApproval!.id, reason: "Refunds over $500 need a manager." });`,
  },
  {
    route: "PUT /interactions/processes/by-id/{id}/start",
    method: "interactions.start",
    example: `const run = await mt.interactions.start({ id: ${q(INTERACTION)} }, { inputs: { message: "Hello!" } });`,
  },
  {
    route: "POST /interactions/processes/by-id/{id}/system-message",
    method: "interactionRuns.addSystemMessage",
    example: `await mt.interactionRuns.addSystemMessage(${q(RUN)}, { content: "Wrap up within two turns." });`,
  },
  {
    route: "GET /interactions/processes/by-id/{id}/tool-results/{sequence}",
    method: "interactionRuns.toolResult",
    example: `const result = await mt.interactionRuns.toolResult(${q(RUN)}, 7);`,
  },
  {
    route: "POST /interactions/processes/by-id/{id}/vote/no",
    method: "interactionRuns.voteNo",
    example: `await mt.interactionRuns.voteNo(${q(RUN)}, { reason: "The total is missing VAT." });`,
  },
  {
    route: "POST /interactions/processes/by-id/{id}/vote/yes",
    method: "interactionRuns.voteYes",
    example: `await mt.interactionRuns.voteYes(${q(RUN)});`,
  },
  {
    route: "PUT /interactions/round-robin/by-id/{id}",
    method: "interactions.updateRoundRobin",
    example: `await mt.interactions.updateRoundRobin(${q(INTERACTION)}, { ...definition, isVotingAllowed: true });`,
  },

  // Invitations
  { route: "GET /invitations/codes", method: "invitations.codes", example: "const codes = await mt.invitations.codes();" },
  { route: "GET /invitations/invites", method: "invitations.list", example: "const invites = await mt.invitations.list();" },
  {
    route: "POST /invitations/invites",
    method: "invitations.send",
    example: `await mt.invitations.send({ invitationCodeId: "0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e", emailAddress: "grace@example.com", inviteToTenant: true });`,
  },
  {
    route: "POST /invitations/invites/by-id/{id}/cancel",
    method: "invitations.cancel",
    example: `await mt.invitations.cancel(${q(INVITE)});`,
  },
  {
    route: "POST /invitations/invites/by-id/{id}/resend-email",
    method: "invitations.resendEmail",
    example: `await mt.invitations.resendEmail(${q(INVITE)});`,
  },

  // Looms
  {
    route: "PUT /looms",
    method: "looms.create",
    example: `const loom = await mt.looms.create({ name: "support-memory", namespaceId: ${q(NAMESPACE)} });`,
  },
  { route: "DELETE /looms/by-id/{id}", method: "looms.delete", example: `await mt.looms.delete(${q(LOOM)});` },
  { route: "GET /looms/by-id/{id}", method: "looms.get", example: `const loom = await mt.looms.get(${q(LOOM)});` },
  {
    route: "PATCH /looms/by-id/{id}",
    method: "looms.update",
    example: `await mt.looms.update(${q(LOOM)}, { description: "What support agents learn about customers" });`,
  },
  { route: "GET /looms/by-id/{id}/inspect", method: "looms.inspect", example: `const inspection = await mt.looms.inspect(${q(LOOM)});` },
  { route: "PUT /looms/by-id/{id}/night-weave", method: "looms.nightWeave", example: `await mt.looms.nightWeave(${q(LOOM)});` },
  {
    route: "GET /looms/by-id/{id}/night-weavings",
    method: "looms.nightWeavings",
    example: `const weavings = await mt.looms.nightWeavings(${q(LOOM)}, { limit: 5 });`,
  },
  { route: "GET /looms/by-id/{id}/panels", method: "looms.panels", example: `const panels = await mt.looms.panels(${q(LOOM)});` },
  { route: "GET /looms/by-id/{id}/patterns", method: "looms.patterns", example: `const patterns = await mt.looms.patterns(${q(LOOM)});` },
  {
    route: "DELETE /looms/by-id/{id}/patterns/by-name/{codebase}",
    method: "looms.deletePattern",
    example: `await mt.looms.deletePattern(${q(LOOM)}, "acme/web-app");`,
  },
  {
    route: "GET /looms/by-id/{id}/patterns/by-name/{codebase}",
    method: "looms.pattern",
    example: `const pattern = await mt.looms.pattern(${q(LOOM)}, "acme/web-app");`,
  },
  {
    route: "PUT /looms/by-id/{id}/patterns/by-name/{codebase}",
    method: "looms.shapePattern",
    example: `await mt.looms.shapePattern(${q(LOOM)}, "acme/web-app", { addConventions: ["Feature folders, one component per file"], addHeuristics: [], addKeyFiles: [], remove: [] });`,
  },
  {
    route: "PUT /looms/by-id/{id}/reflect",
    method: "looms.reflect",
    example: `const reflection = await mt.looms.reflect(${q(LOOM)}, { topic: "Why do refunds escalate?" });`,
  },
  {
    route: "PUT /looms/by-id/{id}/seed",
    method: "looms.seed",
    example: `await mt.looms.seed(${q(LOOM)}, { fromLoom: "company-handbook@shared" });`,
  },
  { route: "GET /looms/by-id/{id}/sessions", method: "looms.sessions", example: `const sessions = await mt.looms.sessions(${q(LOOM)});` },
  {
    route: "GET /looms/by-id/{id}/tapestry",
    method: "looms.tapestry",
    example: `const preview = await mt.looms.tapestry(${q(LOOM)}, { subjects: ["customer:C-1042"], agentName: "Support" });`,
  },
  {
    route: "GET /looms/by-id/{id}/tensions",
    method: "looms.tensions",
    example: `const tensions = await mt.looms.tensions(${q(LOOM)}, { open: true });`,
  },
  {
    route: "PUT /looms/by-id/{id}/tensions/by-id/{tensionId}/resolve",
    method: "looms.resolveTension",
    example: `await mt.looms.resolveTension(${q(LOOM)}, ${q(TENSION)}, { resolution: "The newer policy wins." });`,
  },
  {
    route: "GET /looms/by-id/{id}/threads",
    method: "looms.threads",
    example: `const threads = await mt.looms.threads(${q(LOOM)}, { pinned: true, limit: 50 });`,
  },
  {
    route: "PUT /looms/by-id/{id}/threads",
    method: "looms.weave",
    example: `await mt.looms.weave(${q(LOOM)}, { content: "Ada prefers e-mail to phone calls.", subjects: ["customer:C-1042"], tags: [], private: false, pinned: false });`,
  },
  {
    route: "DELETE /looms/by-id/{id}/threads/by-id/{threadId}",
    method: "looms.deleteThread",
    example: `await mt.looms.deleteThread(${q(LOOM)}, ${q(THREAD)});`,
  },
  {
    route: "GET /looms/by-id/{id}/threads/by-id/{threadId}",
    method: "looms.thread",
    example: `const thread = await mt.looms.thread(${q(LOOM)}, ${q(THREAD)});`,
  },
  {
    route: "PUT /looms/by-id/{id}/threads/by-id/{threadId}/cut",
    method: "looms.cut",
    example: `await mt.looms.cut(${q(LOOM)}, ${q(THREAD)}, { acknowledgment: "Superseded by the 2026 pricing." });`,
  },
  {
    route: "PUT /looms/by-id/{id}/threads/by-id/{threadId}/give",
    method: "looms.give",
    example: `await mt.looms.give(${q(LOOM)}, ${q(THREAD)}, { toLoom: "sales-memory", note: "Useful for renewals" });`,
  },
  {
    route: "PUT /looms/by-id/{id}/threads/by-id/{threadId}/pin",
    method: "looms.pin",
    example: `await mt.looms.pin(${q(LOOM)}, ${q(THREAD)}, { pinned: true });`,
  },
  {
    route: "PUT /looms/by-id/{id}/threads/by-id/{threadId}/reframe",
    method: "looms.reframe",
    example: `await mt.looms.reframe(${q(LOOM)}, ${q(THREAD)}, { content: "Ada prefers e-mail, never before 9am.", reason: "She asked again." });`,
  },
  {
    route: "PUT /looms/by-id/{id}/threads/recall",
    method: "looms.recall",
    example: `const recalled = await mt.looms.recall(${q(LOOM)}, { query: "How does Ada like to be contacted?", limit: 5 });`,
  },
  {
    route: "GET /looms/by-namespace/{namespaceId}",
    method: "looms.list",
    example: `const looms = await mt.looms.list({ namespaceId: ${q(NAMESPACE)} });`,
  },
  {
    route: "GET /looms/night-weavings",
    method: "looms.nightWeavingsSince",
    example: 'const weavings = await mt.looms.nightWeavingsSince({ since: new Date("2026-10-25T00:00:00Z") });',
  },

  // Namespaces
  { route: "GET /namespaces", method: "namespaces.list", example: "const namespaces = await mt.namespaces.list();" },
  { route: "POST /namespaces", method: "namespaces.create", example: 'const namespace = await mt.namespaces.create({ name: "support" });' },
  { route: "DELETE /namespaces/by-id/{id}", method: "namespaces.delete", example: `await mt.namespaces.delete(${q(NAMESPACE)});` },
  { route: "GET /namespaces/by-id/{id}", method: "namespaces.getById", example: `const namespace = await mt.namespaces.getById(${q(NAMESPACE)});` },
  {
    route: "PUT /namespaces/by-id/{id}",
    method: "namespaces.rename",
    example: `await mt.namespaces.rename(${q(NAMESPACE)}, { name: "customer-support" });`,
  },
  {
    route: "GET /namespaces/by-id/{id}/default-credential-stack",
    method: "credentialStacks.getNamespaceDefault",
    example: `const { credentialStackId } = await mt.credentialStacks.getNamespaceDefault(${q(NAMESPACE)});`,
  },
  {
    route: "PUT /namespaces/by-id/{id}/default-credential-stack",
    method: "credentialStacks.setNamespaceDefault",
    example: `await mt.credentialStacks.setNamespaceDefault(${q(NAMESPACE)}, ${q(CREDENTIAL_STACK)});`,
  },
  {
    route: "GET /namespaces/by-id/{id}/web-access",
    method: "namespaces.webAccess",
    example: `const settings = await mt.namespaces.webAccess(${q(NAMESPACE)});`,
  },
  {
    route: "PUT /namespaces/by-id/{id}/web-access",
    method: "namespaces.setWebAccess",
    example: `await mt.namespaces.setWebAccess(${q(NAMESPACE)}, { defaultWebDownloadPartitionId: ${q(PARTITION)} });`,
  },
  { route: "GET /namespaces/by-name/{name}", method: "namespaces.get", example: 'const namespace = await mt.namespaces.get("support");' },
  {
    route: "GET /namespaces/{namespaceName}/agents",
    method: "agents.list",
    example: 'const agents = await mt.agents.list({ namespace: "support" });',
  },
  {
    route: "POST /namespaces/{namespaceName}/agents",
    method: "agents.create",
    example: 'const agent = await mt.agents.create({ name: "greeter", aiModelId: "2f0c8b9e-6a4d-4c3b-9e1f-7d5a3c1b9e2f", systemPrompt: "You are warm and brief.", summaryForOtherAgents: "Says hello" }, { namespace: "support" });',
  },
  {
    route: "GET /namespaces/{namespaceName}/agents/by-name/{name}",
    method: "agents.getByName",
    example: 'const agent = await mt.agents.getByName("greeter", { namespace: "support" });',
  },
  { route: "GET /namespaces/{namespaceName}/apps", method: "apps.list", example: 'const apps = await mt.apps.list({ namespace: "support" });' },
  {
    route: "POST /namespaces/{namespaceName}/apps",
    method: "apps.create",
    example: 'const app = await mt.apps.create({ name: "refund-flow" }, { namespace: "support" });',
  },
  {
    route: "GET /namespaces/{namespaceName}/apps/by-name/{name}",
    method: "apps.getByName",
    example: 'const app = await mt.apps.getByName("refund-flow", { namespace: "support" });',
  },
  {
    route: "PUT /namespaces/{namespaceName}/apps/by-name/{name}/versions/latest/start",
    method: "apps.start",
    example: 'const run = await mt.apps.start({ name: "refund-flow", namespace: "support" }, { inputs: { orderId: "A-1001" } });',
  },
  {
    route: "GET /namespaces/{namespaceName}/apps/processes",
    method: "appRuns.listActive",
    example: 'const active = await mt.appRuns.listActive({ namespace: "support" });',
  },
  {
    route: "GET /namespaces/{namespaceName}/automated-actions",
    method: "automations.list",
    example: 'const automations = await mt.automations.list({ namespace: "support" });',
  },
  {
    route: "POST /namespaces/{namespaceName}/automated-actions",
    method: "automations.create",
    example: 'const automation = await mt.automations.create({ name: "nightly-digest", actions: [{ name: "digest", config: digestConfig }] }, { namespace: "support" });',
  },
  {
    route: "GET /namespaces/{namespaceName}/automated-actions/by-name/{name}",
    method: "automations.getByName",
    example: 'const automation = await mt.automations.getByName("nightly-digest", { namespace: "support" });',
  },
  {
    route: "PUT /namespaces/{namespaceName}/build",
    method: "builds.deploy",
    example: 'await mt.deploy("./maitento", { namespace: "support" }); // or mt.validate(...) / mt.builds.submit(request)',
  },
  {
    route: "GET /namespaces/{namespaceName}/builds",
    method: "builds.list",
    example: 'const page = await mt.builds.list({ namespace: "support", limit: 20 });',
  },
  {
    route: "GET /namespaces/{namespaceName}/capsules",
    method: "capsules.list",
    example: 'const capsules = await mt.capsules.list({ namespace: "support" });',
  },
  {
    route: "GET /namespaces/{namespaceName}/capsules/by-name/{name}",
    method: "capsules.getByName",
    example: 'const capsule = await mt.capsules.getByName("python-sandbox", { namespace: "support" });',
  },
  {
    route: "PUT /namespaces/{namespaceName}/capsules/by-name/{name}/versions/latest/start",
    method: "capsules.start",
    example: 'const run = await mt.capsules.start({ name: "python-sandbox", namespace: "support" });',
  },
  {
    route: "GET /namespaces/{namespaceName}/capsules/processes",
    method: "capsuleRuns.listActive",
    example: 'const active = await mt.capsuleRuns.listActive({ namespace: "support" });',
  },
  {
    route: "GET /namespaces/{namespaceName}/code-pipelines",
    method: "pipelines.list",
    example: 'const pipelines = await mt.pipelines.list({ namespace: "support" });',
  },
  {
    route: "POST /namespaces/{namespaceName}/code-pipelines",
    method: "pipelines.create",
    example: 'const pipeline = await mt.pipelines.create(definition, { namespace: "support" });',
  },
  {
    route: "GET /namespaces/{namespaceName}/code-pipelines/by-name/{name}",
    method: "pipelines.getByName",
    example: 'const pipeline = await mt.pipelines.getByName("fix-bug", { namespace: "support" });',
  },
  {
    route: "PUT /namespaces/{namespaceName}/code-pipelines/by-name/{name}/start",
    method: "pipelines.start",
    example: 'const run = await mt.pipelines.start({ name: "fix-bug", namespace: "support" }, { inputs: { issue: "Login fails on Safari" }, repos });',
  },
  {
    route: "GET /namespaces/{namespaceName}/connectors",
    method: "connectors.list",
    example: 'const connectors = await mt.connectors.list({ namespace: "support" });',
  },
  {
    route: "GET /namespaces/{namespaceName}/connectors/by-name/{name}",
    method: "connectors.getByName",
    example: 'const connector = await mt.connectors.getByName("orders-get", { namespace: "support" });',
  },
  {
    route: "POST /namespaces/{namespaceName}/connectors/mcp",
    method: "connectors.createMcp",
    example: 'await mt.connectors.createMcp({ name: "search-docs", url: "https://mcp.example.com/search", description: "Searches the docs", authenticationType: "None" }, { namespace: "support" });',
  },
  {
    route: "POST /namespaces/{namespaceName}/connectors/open-api",
    method: "connectors.createOpenApi",
    example: 'await mt.connectors.createOpenApi({ name: "orders-get", url: "https://api.example.com/orders/{orderId}", description: "Reads an order", httpMethod: "GET", authenticationType: "Header", pathParameters: [{ name: "orderId", description: "The order number", dataType: "String", isRequired: true }], queryParameters: [] }, { namespace: "support" });',
  },
  {
    route: "GET /namespaces/{namespaceName}/external-operations",
    method: "tools.list",
    example: 'const tools = await mt.tools.list({ namespace: "support" });',
  },
  {
    route: "GET /namespaces/{namespaceName}/external-operations/by-name/{name}",
    method: "tools.getByName",
    example: 'const tool = await mt.tools.getByName("get-order", { namespace: "support" });',
  },
  {
    route: "POST /namespaces/{namespaceName}/external-operations/mcp",
    method: "tools.createMcp",
    example: `await mt.tools.createMcp({ name: "search-docs", connectorId: ${q(CONNECTOR)}, requestBindings: [] }, { namespace: "support" });`,
  },
  {
    route: "POST /namespaces/{namespaceName}/external-operations/open-api",
    method: "tools.createOpenApi",
    example: `await mt.tools.createOpenApi({ name: "get-order", connectorId: ${q(CONNECTOR)}, promptGuidance: "Look up an order by its number.", requestBindings: [], pathBindings: [], queryBindings: [] }, { namespace: "support" });`,
  },
  {
    route: "GET /namespaces/{namespaceName}/interactions",
    method: "interactions.list",
    example: 'const interactions = await mt.interactions.list({ namespace: "support" });',
  },
  {
    route: "GET /namespaces/{namespaceName}/interactions/by-name/{name}",
    method: "interactions.getByName",
    example: 'const interaction = await mt.interactions.getByName("hello", { namespace: "support" });',
  },
  {
    route: "PUT /namespaces/{namespaceName}/interactions/by-name/{name}/start",
    method: "interactions.start",
    example: 'const run = await mt.interactions.start("hello", { inputs: { message: "Hello!" } }); // or mt.interactions.run(...)',
  },
  {
    route: "POST /namespaces/{namespaceName}/interactions/managed",
    method: "interactions.createManaged",
    example: 'const interaction = await mt.interactions.createManaged(definition, { namespace: "support" });',
  },
  {
    route: "POST /namespaces/{namespaceName}/interactions/one-shot",
    method: "interactions.createOneShot",
    example: 'const interaction = await mt.interactions.createOneShot(definition, { namespace: "support" });',
  },
  {
    route: "GET /namespaces/{namespaceName}/interactions/processes",
    method: "interactionRuns.listActive",
    example: 'const active = await mt.interactionRuns.listActive({ namespace: "support" });',
  },
  {
    route: "POST /namespaces/{namespaceName}/interactions/round-robin",
    method: "interactions.createRoundRobin",
    example: 'const interaction = await mt.interactions.createRoundRobin(definition, { namespace: "support" });',
  },
  { route: "GET /namespaces/{namespaceName}/vfs", method: "vfs.list", example: 'const systems = await mt.vfs.list({ namespace: "support" });' },
  { route: "POST /namespaces/{namespaceName}/vfs", method: "vfs.create", example: 'const vfs = await mt.vfs.create({ name: "notes" }, { namespace: "support" });' },
  {
    route: "DELETE /namespaces/{namespaceName}/vfs/by-name/{name}",
    method: "vfs.deleteByName",
    example: 'await mt.vfs.deleteByName("notes", { namespace: "support" });',
  },
  {
    route: "GET /namespaces/{namespaceName}/vfs/by-name/{name}",
    method: "vfs.getByName",
    example: 'const vfs = await mt.vfs.getByName("notes", { namespace: "support" });',
  },
  {
    route: "POST /namespaces/{namespaceName}/vfs/by-name/{name}/batch/edit",
    method: "vfs.open(name).batchEdit",
    example: 'await mt.vfs.open("notes").batchEdit({ edits, atomic: true });',
  },
  {
    route: "POST /namespaces/{namespaceName}/vfs/by-name/{name}/batch/read",
    method: "vfs.open(name).batchRead",
    example: 'const read = await mt.vfs.open("notes").batchRead({ paths: ["/a.md", "/b.md"], maxLinesPerFile: 200 });',
  },
  {
    route: "PUT /namespaces/{namespaceName}/vfs/by-name/{name}/copy",
    method: "vfs.open(name).copy",
    example: 'await mt.vfs.open("notes").copy("/today.md", "/archive/2026-10-26.md");',
  },
  {
    route: "DELETE /namespaces/{namespaceName}/vfs/by-name/{name}/directories",
    method: "vfs.open(name).deleteDir",
    example: 'await mt.vfs.open("notes").deleteDir("/archive", { recursive: true });',
  },
  {
    route: "PUT /namespaces/{namespaceName}/vfs/by-name/{name}/directories",
    method: "vfs.open(name).mkdir",
    example: 'await mt.vfs.open("notes").mkdir("/archive");',
  },
  {
    route: "GET /namespaces/{namespaceName}/vfs/by-name/{name}/directories/contents",
    method: "vfs.open(name).list",
    example: 'const entries = await mt.vfs.open("notes").list("/");',
  },
  {
    route: "GET /namespaces/{namespaceName}/vfs/by-name/{name}/directories/exists",
    method: "vfs.open(name).dirExists",
    example: 'const exists = await mt.vfs.open("notes").dirExists("/archive");',
  },
  {
    route: "DELETE /namespaces/{namespaceName}/vfs/by-name/{name}/files",
    method: "vfs.open(name).delete",
    example: 'await mt.vfs.open("notes").delete("/today.md");',
  },
  {
    route: "PUT /namespaces/{namespaceName}/vfs/by-name/{name}/files/append/bytes",
    method: "vfs.open(name).appendBytes",
    example: 'await mt.vfs.open("notes").appendBytes("/log.bin", new Uint8Array([1, 2, 3]));',
  },
  {
    route: "PUT /namespaces/{namespaceName}/vfs/by-name/{name}/files/append/lines",
    method: "vfs.open(name).appendLines",
    example: 'await mt.vfs.open("notes").appendLines("/log.txt", ["10:02 deploy started", "10:04 deploy finished"]);',
  },
  {
    route: "PUT /namespaces/{namespaceName}/vfs/by-name/{name}/files/append/text",
    method: "vfs.open(name).append",
    example: 'await mt.vfs.open("notes").append("/today.md", "- call Ada\\n");',
  },
  {
    route: "GET /namespaces/{namespaceName}/vfs/by-name/{name}/files/contents/bytes",
    method: "vfs.open(name).readBytes",
    example: 'const bytes = await mt.vfs.open("notes").readBytes("/logo.png");',
  },
  {
    route: "GET /namespaces/{namespaceName}/vfs/by-name/{name}/files/contents/lines",
    method: "vfs.open(name).readLines",
    example: 'const lines = await mt.vfs.open("notes").readLines("/today.md");',
  },
  {
    route: "GET /namespaces/{namespaceName}/vfs/by-name/{name}/files/contents/text",
    method: "vfs.open(name).readText",
    example: 'const text = await mt.vfs.open("notes").readText("/today.md");',
  },
  {
    route: "POST /namespaces/{namespaceName}/vfs/by-name/{name}/files/edit",
    method: "vfs.open(name).edit",
    example: 'await mt.vfs.open("notes").edit({ path: "/today.md", operations });',
  },
  {
    route: "GET /namespaces/{namespaceName}/vfs/by-name/{name}/files/exists",
    method: "vfs.open(name).exists",
    example: 'const exists = await mt.vfs.open("notes").exists("/today.md");',
  },
  {
    route: "PUT /namespaces/{namespaceName}/vfs/by-name/{name}/files/write/bytes",
    method: "vfs.open(name).writeBytes",
    example: 'await mt.vfs.open("notes").writeBytes("/logo.png", pngBytes);',
  },
  {
    route: "PUT /namespaces/{namespaceName}/vfs/by-name/{name}/files/write/lines",
    method: "vfs.open(name).writeLines",
    example: 'await mt.vfs.open("notes").writeLines("/todo.txt", ["call Ada", "ship v2"]);',
  },
  {
    route: "PUT /namespaces/{namespaceName}/vfs/by-name/{name}/files/write/text",
    method: "vfs.open(name).writeText",
    example: 'await mt.vfs.open("notes").writeText("/today.md", "# Today\\n");',
  },
  {
    route: "POST /namespaces/{namespaceName}/vfs/by-name/{name}/find",
    method: "vfs.open(name).find",
    example: 'const found = await mt.vfs.open("notes").find({ path: "/", grep: "Ada" });',
  },
  {
    route: "POST /namespaces/{namespaceName}/vfs/by-name/{name}/move",
    method: "vfs.open(name).move",
    example: 'await mt.vfs.open("notes").move("/today.md", "/archive/today.md");',
  },
  {
    route: "POST /namespaces/{namespaceName}/vfs/by-name/{name}/tree",
    method: "vfs.open(name).tree",
    example: 'const tree = await mt.vfs.open("notes").tree({ path: "/", maxDepth: 3 });',
  },

  // Live events
  {
    route: "GET /notifications",
    method: "events.connect",
    example: 'const events = await mt.events.connect({ scope: "user" });',
  },

  // Partitions
  { route: "GET /partitions", method: "partitions.list", example: "const partitions = await mt.partitions.list();" },
  { route: "PUT /partitions", method: "partitions.create", example: 'const partition = await mt.partitions.create({ name: "handbooks" });' },
  { route: "DELETE /partitions/by-id/{id}", method: "partitions.delete", example: `await mt.partitions.delete(${q(PARTITION)});` },
  { route: "GET /partitions/by-id/{id}", method: "partitions.get", example: `const partition = await mt.partitions.get(${q(PARTITION)});` },
  {
    route: "PUT /partitions/by-id/{id}/embedding-credential-failures/acknowledge",
    method: "partitions.acknowledgeEmbeddingCredentialFailures",
    example: `await mt.partitions.acknowledgeEmbeddingCredentialFailures(${q(PARTITION)});`,
  },
  {
    route: "PUT /partitions/by-id/{id}/embedding-credential-stack",
    method: "partitions.setEmbeddingCredentialStack",
    example: `await mt.partitions.setEmbeddingCredentialStack(${q(PARTITION)}, ${q(CREDENTIAL_STACK)}); // null clears it`,
  },
  {
    route: "DELETE /partitions/by-id/{id}/embedding-credentials",
    method: "partitions.clearEmbeddingCredentials",
    example: `await mt.partitions.clearEmbeddingCredentials(${q(PARTITION)});`,
  },
  {
    route: "PUT /partitions/by-id/{id}/embedding-credentials",
    method: "partitions.setEmbeddingCredentials",
    example: `await mt.partitions.setEmbeddingCredentials(${q(PARTITION)}, { credentials, allowMaitentoFallback: false });`,
  },
  {
    route: "PUT /partitions/by-id/{id}/embedding-profile",
    method: "partitions.changeEmbeddingProfile",
    example: `await mt.partitions.changeEmbeddingProfile(${q(PARTITION)}, { profile, credentials, allowMaitentoFallback: false, allowReindex: true });`,
  },
  {
    route: "GET /partitions/by-id/{id}/files",
    method: "partitions.files",
    example: `for await (const file of mt.partitions.files(${q(PARTITION)})) console.log(file.name);`,
  },
  {
    route: "GET /partitions/embedding-credential-failures",
    method: "partitions.listEmbeddingCredentialFailures",
    example: "const failing = await mt.partitions.listEmbeddingCredentialFailures();",
  },
  {
    route: "GET /partitions/embedding-models",
    method: "partitions.embeddingModels",
    example: "const embeddingModels = await mt.partitions.embeddingModels();",
  },
  {
    route: "POST /partitions/embedding-profile/probe",
    method: "partitions.probeEmbeddingProfile",
    example: "const probe = await mt.partitions.probeEmbeddingProfile({ profile, credentials });",
  },
  {
    route: "PUT /partitions/embedding-status",
    method: "partitions.embeddingStatus",
    example: `const statuses = await mt.partitions.embeddingStatus({ partitionIds: [${q(PARTITION)}] });`,
  },

  // Runs (any kind)
  {
    route: "GET /processes",
    method: "runs.list",
    example: 'for await (const run of mt.runs.list({ types: ["Interaction"], state: "Active" })) console.log(run.id, run.status);',
  },
  { route: "GET /processes/by-id/{id}", method: "runs.get", example: `const summary = await mt.runs.get(${q(RUN)});` },
  { route: "GET /processes/summary", method: "runs.summary", example: "const dashboard = await mt.runs.summary({ hours: 24 });" },
  {
    route: "POST /processes/{processType}/{processId}/kill",
    method: "runs.kill",
    example: `await mt.runs.kill(${q(RUN)}, { type: "Interaction" });`,
  },
  {
    route: "GET /processes/{processType}/{processId}/lane",
    method: "runs.lane",
    example: `const wait = await mt.runs.lane(${q(RUN)}, { type: "Interaction" });`,
  },
  {
    route: "DELETE /processes/{processType}/{processId}/retention-lease",
    method: "runs.release",
    example: `await mt.runs.release(${q(RUN)}, { type: "Interaction" });`,
  },
  {
    route: "GET /processes/{processType}/{processId}/retention-lease",
    method: "runs.retention",
    example: `const retention = await mt.runs.retention(${q(RUN)}, { type: "Interaction" });`,
  },
  {
    route: "PUT /processes/{processType}/{processId}/retention-lease",
    method: "runs.retain",
    example: `await mt.runs.retain(${q(RUN)}, { type: "Interaction", note: "Evidence for ticket 4211" });`,
  },

  // Secrets
  { route: "GET /secrets", method: "secrets.list", example: "const secrets = await mt.secrets.list();" },
  {
    route: "POST /secrets",
    method: "secrets.create",
    example: 'const secret = await mt.secrets.create({ name: "orders-api-key", value: process.env.ORDERS_API_KEY! });',
  },
  { route: "DELETE /secrets/by-id/{id}", method: "secrets.delete", example: `await mt.secrets.delete(${q(SECRET)});` },
  { route: "GET /secrets/by-id/{id}", method: "secrets.get", example: `const secret = await mt.secrets.get(${q(SECRET)});` },
  {
    route: "PUT /secrets/by-id/{id}",
    method: "secrets.update",
    example: `await mt.secrets.update(${q(SECRET)}, { name: "orders-api-key", value: process.env.ORDERS_API_KEY_NEW! });`,
  },
  { route: "GET /secrets/by-name/{name}", method: "secrets.getByName", example: 'const secret = await mt.secrets.getByName("orders-api-key");' },

  // Tenant
  {
    route: "GET /tenants/self/default-credential-stack",
    method: "credentialStacks.getTenantDefault",
    example: "const { credentialStackId } = await mt.credentialStacks.getTenantDefault();",
  },
  {
    route: "PUT /tenants/self/default-credential-stack",
    method: "credentialStacks.setTenantDefault",
    example: `await mt.credentialStacks.setTenantDefault(${q(CREDENTIAL_STACK)}); // null clears it`,
  },
  {
    route: "GET /tenants/self/model-access",
    method: "tenant.modelAccess",
    example: "const { forbidMaitentoCredentials, hasModelKeys } = await mt.tenant.modelAccess();",
  },
  { route: "GET /tenants/self/model-keys", method: "modelKeys.list", example: "const keys = await mt.modelKeys.list();" },
  {
    route: "POST /tenants/self/model-keys",
    method: "modelKeys.create",
    example: 'const key = await mt.modelKeys.create({ provider: "DeepSeek", label: "Production", apiKey: process.env.DEEPSEEK_API_KEY! });',
  },
  {
    route: "DELETE /tenants/self/model-keys/by-id/{id}",
    method: "modelKeys.delete",
    example: `await mt.modelKeys.delete(${q(KEY)});`,
  },
  {
    route: "PUT /tenants/self/model-keys/by-id/{id}",
    method: "modelKeys.update",
    example: `await mt.modelKeys.update(${q(KEY)}, { label: "Production", priority: 0, isDisabled: true });`,
  },
  { route: "GET /tenants/self/retention", method: "tenant.retention", example: "const retention = await mt.tenant.retention();" },
  { route: "PUT /tenants/self/retention", method: "tenant.setRetention", example: "await mt.tenant.setRetention({ hours: 7 * 24 });" },
  { route: "GET /tenants/self/web-access", method: "tenant.webAccess", example: "const settings = await mt.tenant.webAccess();" },
  {
    route: "PUT /tenants/self/web-access",
    method: "tenant.setWebAccess",
    example: `await mt.tenant.setWebAccess({ defaultWebDownloadPartitionId: ${q(PARTITION)} });`,
  },

  // Usage
  {
    route: "GET /usage/breakdown",
    method: "usage.breakdown",
    example: 'const byModel = await mt.usage.breakdown({ from: new Date("2026-10-01"), groupBy: "model" });',
  },
  {
    route: "GET /usage/runs",
    method: "usage.runs",
    example: 'const runs = await mt.usage.runs({ namespace: "support", sort: "cost", limit: 50 });',
  },
  {
    route: "GET /usage/series",
    method: "usage.series",
    example: 'const daily = await mt.usage.series({ from: new Date("2026-10-01"), metric: "cost", bucket: "day" });',
  },
  {
    route: "GET /usage/summary",
    method: "usage.summary",
    example: 'const totals = await mt.usage.summary({ from: new Date("2026-10-01"), to: new Date("2026-11-01") });',
  },

  // Billing
  { route: "GET /billing/standing", method: "billing.standing", example: "const standing = await mt.billing.standing();" },
  { route: "GET /billing/plan", method: "billing.plan", example: "const plan = await mt.billing.plan();" },
  { route: "GET /billing/balance", method: "billing.balance", example: "const { balance, currency } = await mt.billing.balance();" },
  { route: "GET /billing/catalogue", method: "billing.catalogue", example: "const { tiers } = await mt.billing.catalogue();" },
  { route: "GET /billing/notices", method: "billing.notices", example: "const notices = await mt.billing.notices({ limit: 10 });" },
  { route: "GET /billing/auto-top-up", method: "billing.autoTopUp", example: "const autoTopUp = await mt.billing.autoTopUp();" },
  {
    route: "PUT /billing/auto-top-up",
    method: "billing.setAutoTopUp",
    example: "await mt.billing.setAutoTopUp({ enabled: true, thresholdAmount: 10, topUpAmount: 50 });",
  },
  { route: "GET /billing/alerts", method: "billing.alerts", example: "const alerts = await mt.billing.alerts();" },
  {
    route: "PUT /billing/alerts",
    method: "billing.setAlerts",
    example: "await mt.billing.setAlerts({ emailAtPercentOfLastTopUp: 20, showPortalBanner: true, emailWhenWorkRefused: true });",
  },

  // Users
  { route: "GET /users", method: "users.list", example: "const users = await mt.users.list();" },
  {
    route: "PUT /users/by-id/{id}",
    method: "users.update",
    example: `await mt.users.update(${q(USER)}, { isAdmin: false, isEnabled: true });`,
  },
  { route: "GET /users/self", method: "users.self", example: "const { user, tenant, roles } = await mt.users.self();" },
  { route: "GET /users/self/api-keys", method: "apiKeys.list", example: "const keys = await mt.apiKeys.list();" },
  {
    route: "POST /users/self/api-keys",
    method: "apiKeys.create",
    example: 'const { secret } = await mt.apiKeys.create({ name: "ci-deploys" });',
  },
  {
    route: "DELETE /users/self/api-keys/by-id/{id}",
    method: "apiKeys.delete",
    example: `await mt.apiKeys.delete(${q(KEY)});`,
  },

  // Virtual file systems by id
  { route: "GET /vfs", method: "vfs.list", example: "const systems = await mt.vfs.list();" },
  { route: "DELETE /vfs/by-id/{id}", method: "vfs.delete", example: `await mt.vfs.delete(${q(VFS)});` },
  { route: "GET /vfs/by-id/{id}", method: "vfs.get", example: `const vfs = await mt.vfs.get(${q(VFS)});` },
  {
    route: "POST /vfs/by-id/{id}/batch/edit",
    method: "vfs.openById(id).batchEdit",
    example: `await mt.vfs.openById(${q(VFS)}).batchEdit({ edits, atomic: true });`,
  },
  {
    route: "POST /vfs/by-id/{id}/batch/read",
    method: "vfs.openById(id).batchRead",
    example: `const read = await mt.vfs.openById(${q(VFS)}).batchRead({ paths: ["/a.md"], maxLinesPerFile: 200 });`,
  },
  {
    route: "PUT /vfs/by-id/{id}/copy",
    method: "vfs.openById(id).copy",
    example: `await mt.vfs.openById(${q(VFS)}).copy("/today.md", "/archive/today.md");`,
  },
  {
    route: "DELETE /vfs/by-id/{id}/directories",
    method: "vfs.openById(id).deleteDir",
    example: `await mt.vfs.openById(${q(VFS)}).deleteDir("/archive", { recursive: true });`,
  },
  {
    route: "PUT /vfs/by-id/{id}/directories",
    method: "vfs.openById(id).mkdir",
    example: `await mt.vfs.openById(${q(VFS)}).mkdir("/archive");`,
  },
  {
    route: "GET /vfs/by-id/{id}/directories/contents",
    method: "vfs.openById(id).list",
    example: `const entries = await mt.vfs.openById(${q(VFS)}).list("/");`,
  },
  {
    route: "GET /vfs/by-id/{id}/directories/exists",
    method: "vfs.openById(id).dirExists",
    example: `const exists = await mt.vfs.openById(${q(VFS)}).dirExists("/archive");`,
  },
  {
    route: "DELETE /vfs/by-id/{id}/files",
    method: "vfs.openById(id).delete",
    example: `await mt.vfs.openById(${q(VFS)}).delete("/today.md");`,
  },
  {
    route: "PUT /vfs/by-id/{id}/files/append/bytes",
    method: "vfs.openById(id).appendBytes",
    example: `await mt.vfs.openById(${q(VFS)}).appendBytes("/log.bin", new Uint8Array([1, 2, 3]));`,
  },
  {
    route: "PUT /vfs/by-id/{id}/files/append/lines",
    method: "vfs.openById(id).appendLines",
    example: `await mt.vfs.openById(${q(VFS)}).appendLines("/log.txt", ["10:02 deploy started"]);`,
  },
  {
    route: "PUT /vfs/by-id/{id}/files/append/text",
    method: "vfs.openById(id).append",
    example: `await mt.vfs.openById(${q(VFS)}).append("/today.md", "- call Ada\\n");`,
  },
  {
    route: "GET /vfs/by-id/{id}/files/contents/bytes",
    method: "vfs.openById(id).readBytes",
    example: `const bytes = await mt.vfs.openById(${q(VFS)}).readBytes("/logo.png");`,
  },
  {
    route: "GET /vfs/by-id/{id}/files/contents/lines",
    method: "vfs.openById(id).readLines",
    example: `const lines = await mt.vfs.openById(${q(VFS)}).readLines("/today.md");`,
  },
  {
    route: "GET /vfs/by-id/{id}/files/contents/text",
    method: "vfs.openById(id).readText",
    example: `const text = await mt.vfs.openById(${q(VFS)}).readText("/today.md");`,
  },
  {
    route: "POST /vfs/by-id/{id}/files/edit",
    method: "vfs.openById(id).edit",
    example: `await mt.vfs.openById(${q(VFS)}).edit({ path: "/today.md", operations });`,
  },
  {
    route: "GET /vfs/by-id/{id}/files/exists",
    method: "vfs.openById(id).exists",
    example: `const exists = await mt.vfs.openById(${q(VFS)}).exists("/today.md");`,
  },
  {
    route: "PUT /vfs/by-id/{id}/files/write/bytes",
    method: "vfs.openById(id).writeBytes",
    example: `await mt.vfs.openById(${q(VFS)}).writeBytes("/logo.png", pngBytes);`,
  },
  {
    route: "PUT /vfs/by-id/{id}/files/write/lines",
    method: "vfs.openById(id).writeLines",
    example: `await mt.vfs.openById(${q(VFS)}).writeLines("/todo.txt", ["call Ada", "ship v2"]);`,
  },
  {
    route: "PUT /vfs/by-id/{id}/files/write/text",
    method: "vfs.openById(id).writeText",
    example: `await mt.vfs.openById(${q(VFS)}).writeText("/today.md", "# Today\\n");`,
  },
  {
    route: "POST /vfs/by-id/{id}/find",
    method: "vfs.openById(id).find",
    example: `const found = await mt.vfs.openById(${q(VFS)}).find({ path: "/", grep: "Ada" });`,
  },
  {
    route: "POST /vfs/by-id/{id}/move",
    method: "vfs.openById(id).move",
    example: `await mt.vfs.openById(${q(VFS)}).move("/today.md", "/archive/today.md");`,
  },
  {
    route: "POST /vfs/by-id/{id}/tree",
    method: "vfs.openById(id).tree",
    example: `const tree = await mt.vfs.openById(${q(VFS)}).tree({ path: "/", maxDepth: 3 });`,
  },

  // Web hooks
  { route: "GET /web-hooks", method: "webhooks.list", example: "const hooks = await mt.webhooks.list();" },
  {
    route: "POST /web-hooks",
    method: "webhooks.create",
    example: 'await mt.webhooks.create({ type: "InteractionProcess", url: "https://example.com/maitento/webhook", secret: process.env.WEBHOOK_SECRET! });',
  },
  { route: "DELETE /web-hooks/by-id/{id}", method: "webhooks.delete", example: `await mt.webhooks.delete(${q(WEBHOOK)});` },
  { route: "GET /web-hooks/by-id/{id}", method: "webhooks.get", example: `const hook = await mt.webhooks.get(${q(WEBHOOK)});` },
  {
    route: "PUT /web-hooks/by-id/{id}",
    method: "webhooks.update",
    example: `await mt.webhooks.update(${q(WEBHOOK)}, { url: "https://example.com/maitento/webhook-v2" });`,
  },
  {
    route: "GET /web-hooks/by-id/{id}/deliveries",
    method: "webhooks.deliveries",
    example: `const deliveries = await mt.webhooks.deliveries(${q(WEBHOOK)}, { limit: 50 });`,
  },

  // Web tools
  {
    route: "GET /web/usage/by-process/{processId}",
    method: "runs.webUsage",
    example: `const webCalls = await mt.runs.webUsage(${q(RUN)});`,
  },
];

/** The text of route-map.json (what `npm run route-map` writes and the coverage test compares). */
export function routeMapJson(): string {
  const document = {
    $comment:
      "Generated from src/route-map.ts by `npm run route-map`. Do not edit. For every sdk:true route of ../routes.json: the @maitento/sdk call that reaches it, with a one-line example.",
    package: "@maitento/sdk",
    routes: ROUTE_MAP,
    excluded: EXCLUDED_ROUTES,
  };
  return JSON.stringify(document, null, 2) + "\n";
}

/** Public routes the SDK does not wrap: an SDK client is always signed in, and these serve people signing up. */
export const EXCLUDED_ROUTES: readonly ExcludedRoute[] = [
  { route: "GET /auth/sso/providers", reason: "anonymous: the identity providers the portal's sign-in page offers" },
  { route: "GET /auth/sso/{provider}/start", reason: "anonymous: a browser navigation that starts a sign-in with an identity provider (portal)" },
  { route: "GET /auth/sso/{provider}/callback", reason: "anonymous: where the identity provider sends the browser back to (portal)" },
  { route: "POST /auth/sso/exchange", reason: "anonymous: redeems a single sign-on code for a session (portal)" },
  { route: "POST /auth/sso/pending-link/confirm", reason: "anonymous: the link in a single sign-on confirmation e-mail (portal)" },
  { route: "GET /invitations/invites/by-id/{id}/summary", reason: "anonymous: the invite lookup of the portal's sign-up page" },
  { route: "POST /tenants/register", reason: "anonymous: tenant sign-up (portal)" },
  { route: "POST /users/register", reason: "anonymous: user sign-up from an invite (portal)" },
  { route: "POST /users/self/password-reset", reason: "anonymous: completing a password reset (portal)" },
  { route: "PUT /users/self/password-reset", reason: "anonymous: requesting a password-reset e-mail (portal)" },
  { route: "POST /users/self/verify-email-address", reason: "anonymous: e-mail verification link (portal)" },
  { route: "POST /users/self/verify-email-address/resend", reason: "anonymous: asking for a new verification link (portal)" },
];
