import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { describe, it } from "node:test";
import { parse, Value } from "../src/mtr/parser";
import { tokenize } from "../src/mtr/tokenizer";
import { schema } from "./helpers";

const codes = (text: string): string[] => parse(text).issues.map((i) => i.code);
const only = (text: string): Value => {
  const result = parse(text);
  assert.deepEqual(result.issues, [], `no issues in ${JSON.stringify(text)}`);
  return result.entries[0]!.value!;
};

describe("tokenizer", () => {
  it("splits on the compiler's stop characters and whitespace, not on =", () => {
    const kinds = tokenize('a = { b = [1, @ref("x")] }').map((t) => `${t.kind}:${t.value}`);
    assert.deepEqual(kinds, ["word:a", "word:=", "lbrace:{", "word:b", "word:=", "lbracket:[", "word:1", "comma:,", "at:@", "word:ref", "lparen:(", 'string:x', "rparen:)", "rbracket:]", "rbrace:}"]);
    assert.deepEqual(tokenize("a=1").map((t) => t.value), ["a=1"]);
  });

  it("keeps escapes in strings, which may span lines", () => {
    const [t] = tokenize('"say \\"hi\\"\nthen \\\\"');
    assert.equal(t!.kind, "string");
    assert.equal(t!.value, 'say \\"hi\\"\nthen \\\\');
    assert.equal(t!.unterminated, undefined);
  });

  it("starts a comment only where a word starts", () => {
    assert.deepEqual(tokenize("// all of this\nx").map((t) => t.kind), ["comment", "word"]);
    assert.deepEqual(tokenize("a//b").map((t) => t.kind), ["word"]);
    assert.deepEqual(tokenize('"a // b"').map((t) => t.kind), ["string"]);
  });

  it("marks a string with no closing quote", () => {
    assert.equal(tokenize('"open').at(-1)!.unterminated, true);
  });
});

describe("parser", () => {
  it("reads every kind of value", () => {
    assert.deepEqual(only('a = "text"'), { kind: "string", text: "text", range: { start: 4, end: 10 } });
    assert.equal((only("a = -0.5") as { value: number }).value, -0.5);
    assert.equal((only("a = True") as { value: boolean }).value, true);
    assert.equal(only('a = @ref("x")').kind, "ref");
    assert.deepEqual({ ...(only('a = @ref("x", "ns")') as object), range: undefined, nameRange: undefined },
      { kind: "ref", form: "namespaced", name: "x", namespace: "ns", range: undefined, nameRange: undefined });
    assert.equal((only("a = @ref(4e0f2c51-8a5b-4b8e-9a37-1f0c2d6b9e11)") as { form: string }).form, "id");
    assert.equal((only('a = @prompt("p")') as { directive: string }).directive, "prompt");
    assert.equal((only('a = @json("j")') as { directive: string }).directive, "json");
    assert.equal((only("a = { b = 1 c = 2 }") as { entries: unknown[] }).entries.length, 2);
    assert.equal((only("a = [1, 2,]") as { items: unknown[] }).items.length, 2, "a trailing comma is allowed");
    assert.equal((only("a = []") as { items: unknown[] }).items.length, 0, "an empty list parses; the schema check rejects it");
  });

  it("reads map entries and dotted names as one name", () => {
    const [entry] = parse('bindings.query:units = "metric"').entries;
    assert.deepEqual([entry!.name, entry!.base, entry!.key], ["bindings.query:units", "bindings.query", "units"]);
    assert.equal(parse('inputs.prompts = [ { name = "x" } ]').entries[0]!.base, "inputs.prompts");
  });

  it("accepts a file of only comments, and refuses an empty one", () => {
    assert.deepEqual(codes("// nothing yet"), []);
    assert.deepEqual(codes(""), ["empty-file"]);
    assert.deepEqual(codes("  \n\n"), ["empty-file"]);
  });

  it("says what is wrong with the common mistakes", () => {
    assert.deepEqual(codes('summary="A"'), ["spaces-around-equals"]);
    assert.deepEqual(codes('summary =value'), ["spaces-around-equals"]);
    assert.deepEqual(codes('agent = { name = "A", agent = @ref("a") }'), ["comma-in-block"]);
    assert.deepEqual(codes('packages = ["a" "b"]'), ["missing-comma"]);
    assert.deepEqual(codes("mode = Automatic"), ["unquoted-text"]);
    assert.deepEqual(codes("agent = greeter@team"), ["bare-reference"]);
    assert.deepEqual(codes('a = @include("x")'), ["unknown-directive"]);
    assert.deepEqual(codes("a = @ref(greeter)"), ["bad-reference"]);
    assert.deepEqual(codes('a = @prompt(x)'), ["bad-include"]);
    assert.deepEqual(codes("a = { b = 1"), ["unclosed-block"]);
    assert.deepEqual(codes("a = [1, 2"), ["unclosed-list"]);
    assert.deepEqual(codes('a = "open'), ["unterminated-string"]);
    assert.deepEqual(codes("a ="), ["expected-value"]);
    assert.deepEqual(codes("agent {\n}"), ["expected-equals"]);
    assert.deepEqual(codes('1a = "x"'), ["bad-name"]);
    assert.deepEqual(codes("}"), ["unexpected"]);
  });

  it("carries on after an error, so later mistakes are found too", () => {
    const result = parse('a = Automatic\nb = "fine"\nc = Other\n');
    assert.deepEqual(result.issues.map((i) => i.code), ["unquoted-text", "unquoted-text"]);
    assert.deepEqual(result.entries.map((e) => e.name), ["a", "b", "c"]);
  });

  // The same cases Maitento's own parser is tested against (MtrSyntaxParityTests in the SdkModelGenerator's tests).
  const { cases } = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "..", "test", "fixtures", "syntax-cases.json"), "utf8")) as
    { cases: { valid: boolean; text: string }[] };
  for (const { valid, text } of cases) {
    it(`${valid ? "accepts" : "refuses"} ${JSON.stringify(text)}, as the compiler does`, () => {
      const issues = parse(text).issues.map((i) => i.message);
      if (valid) assert.deepEqual(issues, []);
      else assert.notDeepEqual(issues, []);
    });
  }

  for (const rule of schema.syntax.rules) {
    it(`follows the syntax rule "${rule.id}" the way the compiler does`, () => {
      // Rules about the whole file or about properties are checked against the schema elsewhere; the rest are syntax.
      if (rule.id === "not-empty") {
        assert.deepEqual(codes(rule.wrong), ["empty-file"]);
        assert.deepEqual(codes(rule.right), []);
        return;
      }
      if (["no-empty-lists", "unquoted-literals", "set-once", "includes-not-in-lists", "dotted-names"].includes(rule.id)) return;
      assert.notDeepEqual(codes(rule.wrong), [], rule.wrong);
      assert.deepEqual(codes(rule.right), [], rule.right);
    });
  }
});
