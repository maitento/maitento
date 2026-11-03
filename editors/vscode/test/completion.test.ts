import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { complete, Suggestion } from "../src/mtr/completion";
import { placeFile, ProjectIndex } from "../src/mtr/project";
import { AGENT, memoryFs, ROOT, schema } from "./helpers";

const PROJECT = {
  "agents/greeter.mtr": AGENT,
  "agents/team/helper.mtr": AGENT,
  "looms/family.mtr": "// a loom",
  "prompts/task.md": "Do it.",
  "json/answer.json": "{}",
};

/** Completions where `|` is in the text of a file at `target`. */
function at(target: string, textWithCursor: string): Suggestion[] {
  const offset = textWithCursor.indexOf("|");
  const text = textWithCursor.replace("|", "");
  const project = new ProjectIndex(ROOT, schema, memoryFs({ ...PROJECT, [target]: text }));
  return complete(text, offset, { schema, placement: placeFile(schema, target), project });
}
const labels = (suggestions: Suggestion[]): string[] => suggestions.map((s) => s.label);

describe("completion", () => {
  it("offers the kind's properties, required first, leaving out those already set", () => {
    const names = labels(at("agents/a.mtr", 'model = @ref("m")\n|'));
    assert.deepEqual(names.slice(0, 2), ["prompt", "summary"]);
    assert.ok(!names.includes("model"));
    assert.ok(names.includes("allowWebSearch"));
  });

  it("offers a whole new file in an empty one", () => {
    const suggestions = at("interactions/one-shot/x.mtr", "|");
    assert.equal(suggestions[0]!.kind, "file-template");
    assert.match(suggestions[0]!.insertText, /^agent = \{\n\tname = /);
  });

  it("offers a block's own properties inside it", () => {
    const names = labels(at("interactions/one-shot/x.mtr", 'agent = {\n  name = "A"\n  |\n}'));
    assert.ok(names.includes("agent") && names.includes("loom") && names.includes("webAccess"));
    assert.ok(!names.includes("name") && !names.includes("task"));
  });

  it("offers an item's properties inside a list of blocks", () => {
    const names = labels(at("interactions/round-robin/x.mtr", "agents = [\n  {\n    |\n  }\n]"));
    assert.deepEqual(names.slice(0, 2), ["name", "agent"]);
  });

  it("offers the values a property takes after =", () => {
    assert.deepEqual(labels(at("interactions/one-shot/x.mtr", "context = {\n  mode = |")), ['"None"', '"Automatic"', '"Aggressive"', '"FailOnOverflow"']);
    assert.deepEqual(labels(at("agents/a.mtr", "allowSwarm = |")), ["true", "false"]);
    assert.ok(labels(at("interactions/one-shot/x.mtr", "task = |")).includes('@prompt("task")'));
    assert.ok(labels(at("interactions/one-shot/x.mtr", "schema.solution = |")).includes('@json("answer")'));
  });

  it("offers what the project declares inside @ref(\", @prompt(\" and @json(\"", () => {
    assert.deepEqual(labels(at("interactions/one-shot/x.mtr", 'agent = {\n  agent = @ref("|')), ["greeter", "helper"]);
    assert.deepEqual(labels(at("interactions/one-shot/x.mtr", 'agent = {\n  loom = @ref("fa|')), ["family"]);
    assert.deepEqual(labels(at("agents/a.mtr", 'routedSubAgents = [ @ref("greeter"), @ref("|')), ["a", "greeter", "helper"]);
    assert.deepEqual(labels(at("interactions/one-shot/x.mtr", 'task = @prompt("|')), ["task"]);
    assert.deepEqual(labels(at("interactions/one-shot/x.mtr", 'schema.solution = @json("|')), ["answer"]);
  });

  it("offers an enum's values inside its quotes", () => {
    assert.deepEqual(labels(at("connectors/open-api/c.mtr", 'auth = "|')), ["None", "Header", "Maitento"]);
  });

  it("replaces the part of a word already typed", () => {
    const [first] = at("agents/a.mtr", "mod|");
    assert.equal(first!.replaceFrom, 0);
  });

  it("offers nothing outside a project's kind folders", () => {
    assert.deepEqual(at("notes/x.mtr", "|"), []);
  });
});
