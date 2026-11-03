import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { describe, it } from "node:test";
import { publicRoot } from "./helpers";

// The Cogniscript grammar, checked against what the compiler accepts (maitento/app/Compiler/Tokenizer/TokenReader.cs,
// CogniscriptCompiler/Tokenizer, CogniscriptCompiler/PreProcessor/FileReferencePreProcessor.cs) and the language
// reference (docs/reference/cogniscript/index.md).

const extensionRoot = path.resolve(__dirname, "..", "..");
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(extensionRoot, file), "utf8"));
const grammar = read("syntaxes/mtc.tmLanguage.json");

interface Rule {
  include?: string;
  match?: string;
  begin?: string;
  end?: string;
  name?: string;
  captures?: Record<string, { name: string }>;
  beginCaptures?: Record<string, { name: string }>;
  endCaptures?: Record<string, { name: string }>;
  patterns?: Rule[];
}

/** A piece of a line and its innermost scope ("" for text no rule marks). */
type Piece = [text: string, scope: string];

const resolve = (rule: Rule): Rule => (rule.include ? (grammar.repository[rule.include.slice(1)] as Rule) : rule);

/** A rule's list of patterns, flattened through includes and pattern groups. */
const flatten = (rules: Rule[]): Rule[] =>
  rules.map(resolve).flatMap((r) => (r.match || r.begin ? [r] : flatten(r.patterns ?? [])));

function compile(source: string): RegExp {
  // TextMate's (?i:...) has no JavaScript form here. The grammar puts it only around words, so making the whole
  // pattern caseless reads the same.
  return new RegExp(source.replace(/\(\?i:/g, "(?:"), source.includes("(?i:") ? "dgi" : "dg");
}

/**
 * Splits one line into scoped pieces, as TextMate does: at each point the rule that matches earliest wins, and the
 * first-listed one when two match at the same place (in a string, its end comes first).
 */
function tokenize(line: string): Piece[] {
  const pieces: Piece[] = [];
  // Text no rule marks is split into words, so a test can name one.
  const emit = (text: string, scope: string) => {
    const parts = scope ? [text] : text.split(/\s+/);
    for (const part of parts) if (part) pieces.push([part, scope]);
  };
  const emitMatch = (m: RegExpExecArray, captures: Rule["captures"], name: string) => {
    const outer = captures?.["0"]?.name ?? name;
    let at = m.index;
    for (let i = 1; i < m.length; i++) {
      const span = m.indices?.[i];
      const scope = captures?.[String(i)]?.name;
      if (!span || !scope) continue;
      emit(line.slice(at, span[0]), outer);
      emit(line.slice(span[0], span[1]), scope);
      at = span[1];
    }
    emit(line.slice(at, m.index + m[0].length), outer);
    return m.index + Math.max(m[0].length, 1);
  };
  const earliest = (from: number, candidates: { rule: Rule; source: string }[]) => {
    let best: { rule: Rule; m: RegExpExecArray } | undefined;
    for (const candidate of candidates) {
      const re = compile(candidate.source);
      re.lastIndex = from;
      const m = re.exec(line);
      if (m && (!best || m.index < best.m.index)) best = { rule: candidate.rule, m };
    }
    return best;
  };

  const top = flatten(grammar.patterns).map((rule) => ({ rule, source: rule.match ?? rule.begin! }));
  let pos = 0;
  while (pos < line.length) {
    const found = earliest(pos, top);
    if (!found) {
      emit(line.slice(pos), "");
      break;
    }
    emit(line.slice(pos, found.m.index), "");
    const { rule } = found;
    if (rule.match) {
      pos = emitMatch(found.m, rule.captures, rule.name ?? "");
      continue;
    }
    const inside = rule.name ?? "";
    pos = emitMatch(found.m, rule.beginCaptures, inside);
    const end = { rule, source: rule.end! };
    const inner = flatten(rule.patterns ?? []).map((r) => ({ rule: r, source: r.match! }));
    while (pos < line.length) {
      const next = earliest(pos, [end, ...inner]);
      if (!next) {
        emit(line.slice(pos), inside);
        pos = line.length;
        break;
      }
      emit(line.slice(pos, next.m.index), inside);
      if (next.rule === rule) {
        pos = emitMatch(next.m, rule.endCaptures, inside);
        break;
      }
      pos = emitMatch(next.m, next.rule.captures, next.rule.name ?? inside);
    }
  }
  return pieces;
}

/** The scope of the first piece that is exactly `text`, or undefined when no piece is. */
const scopeOf = (line: string, text: string) => tokenize(line).find(([t]) => t === text)?.[1];

const OPERATOR = "keyword.operator.mtc";
const NUMBER = "constant.numeric.mtc";
const ESCAPE = "constant.character.escape.mtc";
const BAD_ESCAPE = "invalid.illegal.unknown-escape.mtc";
const DIRECTIVE = "keyword.control.directive.mtc";
const STRING = "string.quoted.double.mtc";

describe("the Cogniscript grammar", () => {
  it("marks the language's own words, and only in lower case", () => {
    for (const word of ["if", "else", "for", "while", "break", "continue", "try", "catch", "return", "exit", "throw"]) {
      assert.equal(scopeOf(`${word} x`, word), "keyword.control.mtc", word);
    }
    const types = JSON.parse(fs.readFileSync(path.join(publicRoot, "sdks", "cogniscript.json"), "utf8")).types
      .map((t: { keyword: string }) => t.keyword) as string[];
    assert.ok(types.length > 0);
    for (const type of types) assert.equal(scopeOf(`${type} x`, type), "storage.type.mtc", type);
    assert.equal(scopeOf("x = true;", "true"), "constant.language.boolean.mtc");
    assert.equal(scopeOf("x = false;", "false"), "constant.language.boolean.mtc");
    for (const word of ["If", "True", "Int", "null"]) assert.equal(scopeOf(`${word} x`, word), "", word);
  });

  it("reads a name as the compiler does: letters and digits, a leading _ or digit, no _ after that", () => {
    assert.equal(scopeOf("int 2x = 1;", "2x"), "");
    assert.equal(scopeOf("int _count = 1;", "_count"), "");
    assert.equal(scopeOf("x = _count(1);", "_count"), "entity.name.function.mtc");
    assert.equal(scopeOf("x = count2(1);", "count2"), "entity.name.function.mtc");
    assert.equal(scopeOf("x = 2x(1);", "2x"), "entity.name.function.mtc");
    for (const bad of ["retry_count", "x_", "__x", "_a_b", "1_000"]) {
      assert.equal(scopeOf(`int ${bad} = 0;`, bad), "invalid.illegal.name.mtc", bad);
    }
    assert.equal(scopeOf("x = my_func(1);", "my_func"), "invalid.illegal.name.mtc");
    assert.equal(scopeOf("int retry_count = 0;", "int"), "storage.type.mtc");
  });

  it("marks a number with at most one decimal point, on either side", () => {
    for (const n of ["42", "19.99", ".5", "5.", "007", "0"]) assert.equal(scopeOf(`x = ${n};`, n), NUMBER, n);
    assert.deepEqual(tokenize("x = -3;"), [["x", ""], ["=", OPERATOR], ["-", OPERATOR], ["3", NUMBER], [";", "punctuation.terminator.statement.mtc"]]);
    for (const notOne of ["1.2.3", "1e3", "x2", "0x1F"]) {
      assert.ok(tokenize(`x = ${notOne};`).every(([, scope]) => scope !== NUMBER), notOne);
    }
  });

  it("has no GUID literal: braces are always a block", () => {
    const pieces = tokenize("guid id = {6422bf07-1913-4e6c-8a42-391b49d42f11};");
    assert.ok(pieces.every(([, scope]) => !scope.includes("guid")), JSON.stringify(pieces));
    assert.equal(pieces.find(([t]) => t === "{")?.[1], "meta.brace.mtc");
    assert.equal(grammar.repository.guid, undefined);
  });

  it("marks every operator the parser has, and not a single | or &", () => {
    for (const op of ["++", "--", "+=", "-=", "*=", "/=", "%=", "==", "!=", "<", ">", "<=", ">=", "&&", "||", "+", "-", "*", "/", "%", "="]) {
      assert.equal(scopeOf(`a ${op} b`, op), OPERATOR, op);
    }
    assert.equal(scopeOf("x = !done;", "!"), OPERATOR);
    assert.equal(scopeOf("a | b", "|"), "");
    assert.equal(scopeOf("a & b", "&"), "");
  });

  it("has no square brackets, in the grammar or the editor's pairs", () => {
    assert.equal(scopeOf("x = [1];", "["), "");
    assert.equal(scopeOf("x = [1];", "]"), "");
    for (const b of ["{", "}", "(", ")"]) assert.equal(scopeOf(`${b}`, b), "meta.brace.mtc", b);
    const config = read("language-configuration/mtc.json");
    const pairs = [...config.brackets, ...config.surroundingPairs, ...config.autoClosingPairs.map((p: { open: string; close: string }) => [p.open, p.close])];
    assert.ok(pairs.every(([open]) => open !== "["), JSON.stringify(pairs));
  });

  it("has // comments and no /* */ comments, and none inside text", () => {
    assert.equal(scopeOf("x = 1; // note", "// note"), "comment.line.double-slash.mtc");
    assert.equal(scopeOf("x = 1;// note", "// note"), "comment.line.double-slash.mtc");
    assert.ok(tokenize("/* not a comment */").every(([, scope]) => !scope.startsWith("comment")));
    assert.equal(scopeOf("x = \"a // b\";", "a // b"), STRING);
    const config = read("language-configuration/mtc.json");
    assert.deepEqual(config.comments, { lineComment: "//" });
  });

  it("marks the escapes text may use, and the ones that fail the deploy", () => {
    const good = [String.raw`\"`, String.raw`\\`, String.raw`\n`, String.raw`\r`, String.raw`\t`, String.raw`\b`, String.raw`\a`,
      String.raw`\e`, String.raw`\f`, String.raw`\v`, String.raw`\x41`, String.raw`\u00e9`, String.raw`\0`, String.raw`\101`,
      String.raw`\cA`, String.raw`\.`, String.raw`\{`, String.raw`\$`, String.raw`\ `];
    for (const e of good) assert.equal(scopeOf(`x = "a${e}b";`, e), ESCAPE, e);
    for (const e of [String.raw`\d`, String.raw`\w`, String.raw`\s`, String.raw`\_`, String.raw`\8`, String.raw`\q`]) {
      assert.equal(scopeOf(`x = "a${e}b";`, e), BAD_ESCAPE, e);
    }
    assert.equal(scopeOf(String.raw`x = "\x4";`, String.raw`\x`), BAD_ESCAPE);
    assert.equal(scopeOf(String.raw`x = "\u12";`, String.raw`\u`), BAD_ESCAPE);
    assert.equal(scopeOf(String.raw`x = "^\\d{4}$";`, String.raw`\\`), ESCAPE);
    assert.deepEqual(tokenize(String.raw`x = "a\"b";`).slice(-2), [["\"", "punctuation.definition.string.end.mtc"], [";", "punctuation.terminator.statement.mtc"]]);
  });

  it("marks @prompt(\"name\") and @json(\"name\") in code, as the compiler resolves them in apps and hooks", () => {
    assert.deepEqual(tokenize("string t = @prompt(\"house-style\");").slice(2, 8), [
      ["=", OPERATOR], ["@", DIRECTIVE], ["prompt", DIRECTIVE], ["(", "meta.brace.mtc"], ["\"house-style\"", STRING], [")", "meta.brace.mtc"],
    ]);
    assert.equal(scopeOf("x = StringToJsonObject(@json(\"ideas\"));", "json"), DIRECTIVE);
    assert.equal(scopeOf("x = @ JSON ( \"ideas\" );", "JSON"), DIRECTIVE);
    // Inside text, or in a comment, it is just text; without a quoted name it isn't an include.
    assert.equal(scopeOf("x = \"@prompt(\\\"a\\\")\";", "@prompt("), STRING);
    assert.ok(tokenize("// @prompt(\"a\")").every(([, scope]) => scope === "comment.line.double-slash.mtc"));
    assert.ok(tokenize("x = @prompt(name);").every(([, scope]) => scope !== DIRECTIVE));
  });

  it("marks @promptJson(pipeline/name) and @schemaJson(pipeline/name) inside text, as the SDKs replace them", () => {
    const line = "string s = \"{\\\"prompt\\\": \\\"@promptJson(tested-change/fix)\\\", \\\"schema\\\": @schemaJson(tested-change/verdict)}\";";
    assert.equal(scopeOf(line, "@promptJson(tested-change/fix)"), DIRECTIVE);
    assert.equal(scopeOf(line, "@schemaJson(tested-change/verdict)"), DIRECTIVE);
    // The SDKs' pattern is @promptJson\(([^)]+)\): it needs a name, and its case.
    assert.ok(tokenize("x = \"@promptJson()\";").every(([, scope]) => scope !== DIRECTIVE));
    assert.ok(tokenize("x = \"@PromptJson(a/b)\";").every(([, scope]) => scope !== DIRECTIVE));
  });

  it("reads a whole program from the language reference the same way", () => {
    const program = [
      "string main(string product, int count) {",
      "\tPrintLine(\"Writing \" + count + \" taglines for \" + product);",
      "\treturn(\"done\");",
      "}",
    ];
    assert.deepEqual(program.map(tokenize), [
      [["string", "storage.type.mtc"], ["main", "entity.name.function.mtc"], ["(", "meta.brace.mtc"], ["string", "storage.type.mtc"], ["product", ""],
        [",", "punctuation.separator.comma.mtc"], ["int", "storage.type.mtc"], ["count", ""], [")", "meta.brace.mtc"], ["{", "meta.brace.mtc"]],
      [["PrintLine", "entity.name.function.mtc"], ["(", "meta.brace.mtc"], ["\"", "punctuation.definition.string.begin.mtc"], ["Writing ", STRING],
        ["\"", "punctuation.definition.string.end.mtc"], ["+", OPERATOR], ["count", ""], ["+", OPERATOR],
        ["\"", "punctuation.definition.string.begin.mtc"], [" taglines for ", STRING], ["\"", "punctuation.definition.string.end.mtc"],
        ["+", OPERATOR], ["product", ""], [")", "meta.brace.mtc"], [";", "punctuation.terminator.statement.mtc"]],
      [["return", "keyword.control.mtc"], ["(", "meta.brace.mtc"], ["\"", "punctuation.definition.string.begin.mtc"], ["done", STRING],
        ["\"", "punctuation.definition.string.end.mtc"], [")", "meta.brace.mtc"], [";", "punctuation.terminator.statement.mtc"]],
      [["}", "meta.brace.mtc"]],
    ]);
  });
});
