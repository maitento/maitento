import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { describe, it } from "node:test";
import { checkProject } from "../src/cli";
import { analyze } from "../src/mtr/analyzer";
import { findProjectRoot, placeFile, ProjectIndex } from "../src/mtr/project";
import { kindSnippet } from "../src/mtr/snippets";
import { expandSnippet, memoryFs, publicRoot, ROOT, schema } from "./helpers";

describe("project layout", () => {
  it("places a file in each kind's folder, named after the file (or an app's folder)", () => {
    const place = (p: string): string | undefined => {
      const placement = placeFile(schema, p);
      return placement && `${placement.kind.id}:${placement.name}`;
    };
    assert.equal(place("agents/greeter.mtr"), "agent:greeter");
    assert.equal(place("agents/deep/down/greeter.mtr"), "agent:greeter");
    assert.equal(place("interactions/one-shot/hello.mtr"), "interaction-one-shot:hello");
    assert.equal(place("interactions/round-robin/chat.mtr"), "interaction-round-robin:chat");
    assert.equal(place("interactions/managed/team.mtr"), "interaction-managed:team");
    assert.equal(place("connectors/open-api/c.mtr"), "connector:c");
    assert.equal(place("external-operations/open-api/t.mtr"), "tool:t");
    assert.equal(place("capsules/c.mtr"), "capsule:c");
    assert.equal(place("looms/family.mtr"), "loom:family");
    assert.equal(place("apps/taglines/settings.mtr"), "app:taglines");
    assert.equal(place("apps/x.mtr"), undefined, "an app's .mtr is inside the app's folder");
    assert.equal(place("interactions/hello.mtr"), undefined);
    assert.equal(place("connectors/c.mtr"), undefined);
    assert.equal(place("agents/readme.md"), undefined);
  });

  it("finds the project root: the folder above with the most project folders, and of those the nearest", () => {
    const fs = memoryFs({
      "repo/agents/notes.txt": "",
      "repo/project/agents/a.mtr": "",
      "repo/project/interactions/one-shot/x.mtr": "",
      "repo/project/agents/looms/odd.mtr": "",
    });
    const root = path.resolve(ROOT, "repo", "project");
    assert.equal(findProjectRoot(schema, path.resolve(root, "agents", "a.mtr"), fs), root);
    assert.equal(findProjectRoot(schema, path.resolve(root, "agents", "looms", "odd.mtr"), fs), root, "an agent in a sub-folder named looms is still an agent");
    assert.equal(findProjectRoot(schema, path.resolve(ROOT, "repo", "notes", "x.mtr"), fs), undefined);
  });

  it("indexes what the project declares", () => {
    const project = new ProjectIndex(ROOT, schema, memoryFs({
      "agents/a.mtr": "",
      "agents/team/B.mtr": "",
      "apps/app1/app1.mtc": "",
      "apps/app1/settings.mtr": "",
      "prompts/x/p.md": "",
      "json/s.schema.json": "",
    }));
    assert.deepEqual(project.names(["agent"]), ["a", "B"]);
    assert.equal(project.find(["agent"], "b").length, 1);
    assert.deepEqual(project.names(["app"]), ["app1"]);
    assert.deepEqual([...project.prompts.keys()], ["p"]);
    assert.deepEqual([...project.json.keys()], ["s.schema"], "a name is the file name without its last extension");
  });
});

describe("snippets", () => {
  for (const kind of schema.kinds) {
    it(`a new ${kind.title.toLowerCase()} file from its snippet has no errors but its references`, () => {
      const text = expandSnippet(kindSnippet(schema, kind).body.join("\n"));
      const placement = placeFile(schema, kind.perSubfolder ? `${kind.folder}/x/x.mtr` : `${kind.folder}/x.mtr`);
      const { issues } = analyze(text, { schema, placement });
      assert.deepEqual(issues.map((i) => `${i.code}: ${i.message}`), [], text);
    });
  }
});

describe("the example projects", () => {
  const examples = path.join(publicRoot, "examples");
  const projects = fs.readdirSync(examples).filter((n) => fs.existsSync(path.join(examples, n, "maitento"))).sort();
  assert.ok(projects.length > 0, "the examples are found");
  for (const name of projects) {
    it(`${name} has nothing to report`, () => {
      const findings = checkProject(path.join(examples, name, "maitento"), schema);
      assert.deepEqual(findings.map((f) => `${f.file}:${f.line}: ${f.code}: ${f.message}`), []);
    });
  }
});

