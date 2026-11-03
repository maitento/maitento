import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { durationProblem, templateProblems } from "../src/mtr/analyzer";
import { AGENT, check, messages } from "./helpers";

const ONE_SHOT = 'agent = {\n  name = "A"\n  agent = @ref("a")\n}\ntask = "t"\n';
const codesOf = (files: Record<string, string>, target: string): string[] => check(files, target).issues.map((i) => i.code);

describe("analyzer: properties", () => {
  it("finds nothing wrong with a correct file", () => {
    assert.deepEqual(codesOf({ "agents/a.mtr": AGENT, "interactions/one-shot/x.mtr": ONE_SHOT }, "interactions/one-shot/x.mtr"), []);
  });

  it("names an unknown property, and the one that was probably meant", () => {
    const result = check({ "agents/a.mtr": `${AGENT}sumary = "x"\n` }, "agents/a.mtr");
    assert.deepEqual(messages(result), ["unknown-property: `sumary` is not a property of this agent file. Did you mean `summary`?"]);
  });

  it("explains that a name with dots is one name", () => {
    const result = check({ "interactions/one-shot/x.mtr": `${ONE_SHOT}inputs = [ { name = "t" } ]\ncontext.mode = "None"\n` }, "interactions/one-shot/x.mtr");
    const found = messages(result, "unknown-property");
    assert.match(found[0]!, /did you mean `inputs\.prompts = \.\.\.`/);
    assert.match(found[1]!, /Set it inside the block: `context = \{ mode = \.\.\. \}`/);
  });

  it("names every required property that is missing, at any depth", () => {
    assert.deepEqual(messages(check({ "agents/a.mtr": 'model = @ref("m")\n' }, "agents/a.mtr"), "missing-required"),
      ["missing-required: This agent file needs `prompt` and `summary`."]);
    const nested = check({ "interactions/one-shot/x.mtr": 'agent = { name = "A" }\ntask = "t"\n' }, "interactions/one-shot/x.mtr");
    assert.deepEqual(messages(nested, "missing-required"), ["missing-required: The `agent` block needs `agent`."]);
    const item = check({ "interactions/round-robin/x.mtr": 'agents = [ { agent = @ref("a") } ]\ntask = "t"\n' }, "interactions/round-robin/x.mtr");
    assert.deepEqual(messages(item, "missing-required"), ["missing-required: An item of `agents` needs `name`."]);
  });

  it("refuses a property set twice", () => {
    assert.deepEqual(codesOf({ "agents/a.mtr": `${AGENT}summary = "again"\n` }, "agents/a.mtr"), ["duplicate-property"]);
  });

  it("checks each value's shape", () => {
    const file = `${AGENT}allowSwarm = "true"\nfunctions = { ref = @ref("t") }\nroutedSubAgents = []\n`;
    assert.deepEqual(codesOf({ "agents/a.mtr": file }, "agents/a.mtr"), ["quoted-boolean", "wrong-type", "empty-list"]);
    assert.deepEqual(codesOf({ "agents/a.mtr": 'model = "deepseek.deepseek-v4-flash"\nprompt = "p"\nsummary = "s"\n' }, "agents/a.mtr"), ["wrong-type"]);
    assert.deepEqual(codesOf({ "agents/a.mtr": `${AGENT}allowWebSearch = 1\n` }, "agents/a.mtr"), ["wrong-type"]);
  });

  it("checks enum values, ignoring case as the compiler does", () => {
    const base = `${ONE_SHOT}context = {\n  mode = "%"\n}\n`;
    assert.deepEqual(codesOf({ "agents/a.mtr": AGENT, "interactions/one-shot/x.mtr": base.replace("%", "failonoverflow") }, "interactions/one-shot/x.mtr"), []);
    assert.deepEqual(messages(check({ "agents/a.mtr": AGENT, "interactions/one-shot/x.mtr": base.replace("%", "Rolling") }, "interactions/one-shot/x.mtr")),
      ['bad-enum: "Rolling" is not one of "None", "Automatic", "Aggressive", "FailOnOverflow".']);
  });

  it("checks durations, URLs, HTTP methods and whole numbers", () => {
    const tool = 'method = "%M"\nurl = "%U"\ndescription = "d"\n';
    assert.deepEqual(codesOf({ "connectors/open-api/c.mtr": tool.replace("%M", "post").replace("%U", "https://x.example/{id}") }, "connectors/open-api/c.mtr"), []);
    assert.deepEqual(codesOf({ "connectors/open-api/c.mtr": tool.replace("%M", "FETCH").replace("%U", "/relative") }, "connectors/open-api/c.mtr"), ["unknown-method", "bad-url"]);
    assert.deepEqual(codesOf({ "agents/a.mtr": AGENT, "interactions/one-shot/x.mtr": `${ONE_SHOT}duration.max = "5m"\n` }, "interactions/one-shot/x.mtr"), ["bad-duration"]);
    assert.deepEqual(codesOf({ "interactions/managed/x.mtr": 'manager = { name = "M" agent = @ref("a") }\nagents = [ { name = "W" agent = @ref("a") } ]\ntask = "t"\nlimits.maxDispatches = 2.5\n', "agents/a.mtr": AGENT }, "interactions/managed/x.mtr"), ["not-whole"]);
  });

  it("checks map entries", () => {
    const tool = 'connector = @ref("c")\n';
    const files = { "connectors/open-api/c.mtr": 'method = "GET"\nurl = "https://x.example"\ndescription = "d"\n' };
    assert.deepEqual(codesOf({ ...files, "external-operations/open-api/t.mtr": `${tool}bindings.query:units = "metric"\nbindings.query:lang = "en"\n` }, "external-operations/open-api/t.mtr"), []);
    assert.deepEqual(codesOf({ ...files, "external-operations/open-api/t.mtr": `${tool}bindings.query = "x"\n` }, "external-operations/open-api/t.mtr"), ["map-without-key"]);
    assert.deepEqual(codesOf({ ...files, "external-operations/open-api/t.mtr": `${tool}guidance:x = "x"\n` }, "external-operations/open-api/t.mtr"), ["not-a-map"]);
    assert.deepEqual(codesOf({ ...files, "external-operations/open-api/t.mtr": `${tool}bindings.query: = "x"\n` }, "external-operations/open-api/t.mtr"), ["empty-key"]);
  });
});

describe("analyzer: includes and references", () => {
  it("resolves @prompt and @json in any sub-folder, and checks what they include", () => {
    const files = {
      "interactions/one-shot/x.mtr": ONE_SHOT.replace('task = "t"', 'task = @prompt("task")\nschema.solution = @json("answer")'),
      "prompts/deep/task.md": "Do %%thing%%.",
      "json/answer.json": '{ "type": "object" }',
      "agents/a.mtr": AGENT,
    };
    assert.deepEqual(codesOf(files, "interactions/one-shot/x.mtr"), []);
    assert.deepEqual(codesOf({ ...files, "json/answer.json": "[1]" }, "interactions/one-shot/x.mtr"), ["json-not-object"]);
    assert.deepEqual(codesOf({ ...files, "json/answer.json": "{ nope" }, "interactions/one-shot/x.mtr"), ["bad-json"]);
    assert.deepEqual(codesOf({ ...files, "prompts/deep/task.md": "{{#if thing}}Do it." }, "interactions/one-shot/x.mtr"), ["bad-template"]);
    const missing = { ...files };
    delete (missing as Record<string, string>)["prompts/deep/task.md"];
    assert.deepEqual(messages(check(missing, "interactions/one-shot/x.mtr")),
      ["include-not-found: There is no prompts/task.md in this project (the name is the file name without .md, in any sub-folder of prompts/)."]);
  });

  it("refuses an include in a list, and inline JSON that is not JSON", () => {
    const files = { "interactions/one-shot/x.mtr": `${ONE_SHOT}prompts.system = [ @prompt("p") ]\nschema.solution = "{\\"type\\": \\"object\\"}"\n`, "prompts/p.md": "x", "agents/a.mtr": AGENT };
    assert.deepEqual(codesOf(files, "interactions/one-shot/x.mtr"), ["include-in-list", "bad-json"]);
  });

  it("warns about a reference the project does not declare, ignoring capitals", () => {
    const file = `${AGENT}routedSubAgents = [ @ref("Helper"), @ref("missing"), @ref("x", "other-ns") ]\n`;
    const result = check({ "agents/a.mtr": file, "agents/team/helper.mtr": AGENT }, "agents/a.mtr");
    assert.deepEqual(messages(result), ['reference-not-found: There is no agent named "missing" in this project. It must already exist in the namespace you deploy to.']);
    assert.equal(result.issues[0]!.severity, "warning");
  });

  it("does not look in the project for models, secrets and file systems", () => {
    const capsule = 'vfs = [ { vfs = @ref("data") mountName = "data" } ]\nsecrets = [ { secret = @ref("key") mountName = "key" } ]\n';
    assert.deepEqual(codesOf({ "capsules/c.mtr": capsule, "agents/a.mtr": AGENT }, "capsules/c.mtr"), []);
    assert.deepEqual(codesOf({ "agents/a.mtr": AGENT }, "agents/a.mtr"), []);
  });
});

describe("analyzer: the file in its project", () => {
  it("refuses two resources of a kind with the same name, wherever they are", () => {
    const result = check({ "agents/a.mtr": AGENT, "agents/team/A.mtr": AGENT }, "agents/a.mtr");
    assert.deepEqual(result.issues.map((i) => i.code), ["duplicate-name"]);
    assert.match(result.issues[0]!.message, /agents\/team\/A\.mtr/);
  });

  it("knows an app folder holds at most one .mtr, beside its code", () => {
    assert.deepEqual(codesOf({ "apps/x/x.mtr": "// settings", "apps/x/main.mtc": "void main() { }" }, "apps/x/x.mtr"), []);
    assert.deepEqual(codesOf({ "apps/x/x.mtr": "// a", "apps/x/y.mtr": "// b", "apps/x/main.mtc": "void main() { }" }, "apps/x/x.mtr"), ["too-many-files"]);
    assert.deepEqual(codesOf({ "apps/x/x.mtr": "// settings" }, "apps/x/x.mtr"), ["app-without-code"]);
  });

  it("warns about a name a deploy would refuse", () => {
    assert.deepEqual(codesOf({ "agents/my agent.mtr": AGENT }, "agents/my agent.mtr"), ["bad-resource-name"]);
  });

  it("checks only the syntax of a file outside a kind's folder", () => {
    assert.deepEqual(codesOf({ "notes/x.mtr": 'anything = "goes"\n' }, "notes/x.mtr"), []);
  });
});

describe("analyzer: helpers", () => {
  it("reads durations as the build does", () => {
    assert.equal(durationProblem("00:05:00"), undefined);
    assert.equal(durationProblem("1:30"), undefined);
    assert.equal(durationProblem("1.02:03:04"), undefined);
    assert.equal(durationProblem("00:90:00")?.severity, "error");
    assert.equal(durationProblem("five minutes")?.severity, "error");
    assert.equal(durationProblem("5")?.severity, "warning");
    assert.equal(durationProblem("24:00:00")?.severity, "warning");
  });

  it("checks prompt template blocks as the build does", () => {
    assert.deepEqual(templateProblems("{{#if a}}x{{/if}} {{#unless b}}y{{/unless}}"), []);
    assert.equal(templateProblems("{{#if a}}x").length, 1);
    assert.equal(templateProblems("{{#IF a}}x{{/if}}").length, 0, "matched ignoring case");
    assert.ok(templateProblems("{{#if   }}x{{/if}}").some((p) => p.includes("names no input")));
  });
});
