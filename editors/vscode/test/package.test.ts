import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { describe, it } from "node:test";
import { docsUrl, KIND_PAGES, slug } from "../src/mtr/docs";
import { publicRoot, schema } from "./helpers";

const extensionRoot = path.resolve(__dirname, "..", "..");
const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8"));

describe("the extension manifest", () => {
  it("points at files that exist", () => {
    const contributes = manifest.contributes;
    const files = [
      ...contributes.languages.map((l: { configuration: string }) => l.configuration),
      ...contributes.grammars.map((g: { path: string }) => g.path),
      ...contributes.snippets.map((s: { path: string }) => s.path),
      "schema/mtr-schema.json",
    ];
    for (const file of files) assert.ok(fs.existsSync(path.join(extensionRoot, file)), file);
  });

  it("has a snippet for every kind", () => {
    const snippets = JSON.parse(fs.readFileSync(path.join(extensionRoot, "snippets", "mtr.json"), "utf8"));
    assert.deepEqual(Object.values(snippets).map((s) => (s as { prefix: string }).prefix), schema.kinds.map((k) => `mtr-${k.id}`));
  });

  it("bundles the schema the repository generates", () => {
    const bundled = fs.readFileSync(path.join(extensionRoot, "schema", "mtr-schema.json"), "utf8");
    const generated = fs.readFileSync(path.join(publicRoot, "sdks", "mtr-schema.json"), "utf8");
    assert.equal(bundled, generated);
  });
});

describe("the grammars", () => {
  for (const file of ["mtr.tmLanguage.json", "mtc.tmLanguage.json"]) {
    it(`${file}: every pattern compiles`, () => {
      const grammar = JSON.parse(fs.readFileSync(path.join(extensionRoot, "syntaxes", file), "utf8"));
      const visit = (node: unknown): void => {
        if (!node || typeof node !== "object") return;
        for (const [key, value] of Object.entries(node)) {
          // TextMate's (?i:...) inline flag group is not JavaScript; read it as a plain group to check the rest.
          if ((key === "match" || key === "begin" || key === "end") && typeof value === "string") new RegExp(value.replace(/\(\?i:/g, "(?:"));
          else visit(value);
        }
      };
      visit(grammar);
    });
  }

  it("mtr: names a property, and keeps a comment out of strings and words", () => {
    const grammar = JSON.parse(fs.readFileSync(path.join(extensionRoot, "syntaxes", "mtr.tmLanguage.json"), "utf8"));
    const property = new RegExp(grammar.repository.property.match);
    const comment = new RegExp(grammar.repository.comment.match);
    assert.equal(property.exec('  inputs.prompts = [')?.[1], "inputs.prompts");
    assert.equal(property.exec('bindings.query:units = "metric"')?.[3], "units");
    assert.equal(property.exec('summary="x"'), null);
    assert.equal(comment.exec("url = a//b"), null);
    assert.ok(comment.test("x = 1 // note"));
  });
});

describe("links into the reference", () => {
  const pages = path.join(publicRoot, "docs", "reference", "project-files");
  const anchors = (file: string): Set<string> => new Set([...fs.readFileSync(path.join(pages, file), "utf8")
    .replace(/```[\s\S]*?```/g, "")
    .matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => slug(m[1]!)));

  it("has a page for every kind", () => {
    assert.deepEqual(Object.keys(KIND_PAGES).sort(), schema.kinds.map((k) => k.id).sort());
  });

  for (const kind of schema.kinds) {
    it(`${kind.id}: the page and every top-level property's section exist`, () => {
      const file = KIND_PAGES[kind.id]!;
      assert.ok(fs.existsSync(path.join(pages, file)), file);
      const found = anchors(file);
      for (const property of kind.properties) {
        const url = docsUrl(kind.id, property.name)!;
        assert.ok(found.has(url.slice(url.indexOf("#") + 1)), `${file} has a section for ${property.name} (${url})`);
      }
    });
  }
});
