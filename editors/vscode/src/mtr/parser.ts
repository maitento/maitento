import { Token, tokenize } from "./tokenizer";

/**
 * The `.mtr` parser. It accepts exactly what Maitento's compiler accepts, so a file it finds no syntax error in parses
 * on the server too. Unlike the compiler, which stops at the first error, it carries on to the next line that looks
 * like a property, so one mistake does not hide the rest of the file.
 */
export interface Range {
  start: number;
  end: number;
}

export type Severity = "error" | "warning" | "information";

export interface Issue {
  range: Range;
  message: string;
  severity: Severity;
  code: string;
}

export interface Entry {
  /** The name as written, map key included (`bindings.query:current`). */
  name: string;
  /** For a map entry (`name:key`): the property's name, and the key. */
  base: string;
  key?: string;
  nameRange: Range;
  value: Value | undefined;
  range: Range;
}

export type Value =
  | { kind: "string"; text: string; range: Range }
  | { kind: "number"; text: string; value: number; range: Range }
  | { kind: "boolean"; value: boolean; range: Range }
  | { kind: "ref"; form: "name" | "namespaced" | "id"; name?: string; namespace?: string; id?: string; nameRange?: Range; range: Range }
  | { kind: "include"; directive: "prompt" | "json"; name: string; nameRange: Range; range: Range }
  | { kind: "block"; entries: Entry[]; open: Range; close?: Range; range: Range }
  | { kind: "array"; items: Value[]; range: Range };

export interface ParseResult {
  entries: Entry[];
  issues: Issue[];
  /** Every token, comments included. */
  tokens: Token[];
}

/** decimal.TryParse with the number styles the compiler uses: a sign, digits and one decimal point. */
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
const GUID = /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/;

export function parse(text: string): ParseResult {
  return new Parser(text).run();
}

class Parser {
  private readonly all: Token[];
  private readonly tokens: Token[];
  private readonly issues: Issue[] = [];
  private index = 0;

  constructor(private readonly text: string) {
    this.all = tokenize(text);
    this.tokens = this.all.filter((t) => t.kind !== "comment");
  }

  run(): ParseResult {
    for (const token of this.all) {
      if (token.kind === "string" && token.unterminated) {
        this.error(token, "This text has no closing quote.", "unterminated-string");
      }
    }
    if (this.all.length === 0) {
      this.issues.push({
        range: { start: 0, end: 0 },
        message: "An empty file does not build: add a property, or a comment.",
        severity: "error",
        code: "empty-file",
      });
      return { entries: [], issues: this.issues, tokens: this.all };
    }

    const entries = this.entries(false);
    while (this.peek()) {
      const stray = this.peek()!;
      this.error(stray, stray.kind === "rbrace" ? "This } closes no block." : stray.kind === "rbracket" ? "This ] closes no list." : `Unexpected ${describe(stray)}.`, "unexpected");
      this.index++;
      this.recover(false);
      entries.push(...this.entries(false));
    }
    return { entries, issues: this.issues, tokens: this.all };
  }

  private peek(ahead = 0): Token | undefined {
    return this.tokens[this.index + ahead];
  }

  private next(): Token | undefined {
    return this.tokens[this.index++];
  }

  private error(at: Token | Range, message: string, code: string): void {
    this.issues.push({ range: { start: at.start, end: at.end }, message, severity: "error", code });
  }

  private lineOf(offset: number): number {
    let line = 0;
    for (let i = 0; i < offset && i < this.text.length; i++) if (this.text[i] === "\n") line++;
    return line;
  }

  /** After an error: skip to the next line that starts with `name =`, or to a `}` that may close the block. */
  private recover(inBlock: boolean): void {
    const from = this.peek(-1) ?? this.peek();
    const line = from ? this.lineOf(from.start) : -1;
    while (this.peek()) {
      const t = this.peek()!;
      if (t.kind === "rbrace" && inBlock) return;
      if (t.kind === "word" && this.peek(1)?.kind === "word" && this.peek(1)!.value === "=" && this.lineOf(t.start) > line) return;
      this.index++;
    }
  }

  /** Entries until the end of the file, or (in a block) a `}`. */
  private entries(inBlock: boolean): Entry[] {
    const entries: Entry[] = [];
    while (this.peek() && !(inBlock && this.peek()!.kind === "rbrace")) {
      const entry = this.entry(inBlock);
      if (entry) entries.push(entry);
    }
    return entries;
  }

  private entry(inBlock: boolean): Entry | undefined {
    const nameToken = this.peek()!;
    if (nameToken.kind !== "word") {
      if (!inBlock && (nameToken.kind === "rbrace" || nameToken.kind === "rbracket")) {
        this.error(nameToken, nameToken.kind === "rbrace" ? "This } closes no block." : "This ] closes no list.", "unexpected");
        this.index++;
        this.recover(inBlock);
        return undefined;
      }
      this.error(nameToken, nameToken.kind === "comma" && inBlock
        ? "A block has no commas between its entries: put each `name = value` after the last."
        : `Expected a property name, but found ${describe(nameToken)}.`, nameToken.kind === "comma" ? "comma-in-block" : "expected-name");
      this.index++;
      this.recover(inBlock);
      return undefined;
    }

    const equals = this.peek(1);
    if (!equals || equals.kind !== "word" || equals.value !== "=") {
      if (nameToken.value.includes("=") || (equals?.kind === "word" && equals.value.startsWith("="))) {
        this.error(nameToken, "Put spaces around `=`: `name = value`.", "spaces-around-equals");
      } else if (equals?.kind === "lbrace") {
        this.error(nameToken, `Expected \`=\` after \`${nameToken.value}\`: \`${nameToken.value} = { ... }\`.`, "expected-equals");
      } else {
        this.error(equals ?? nameToken, `Expected \`=\` after \`${nameToken.value}\`.`, "expected-equals");
      }
      this.index++;
      this.recover(inBlock);
      return undefined;
    }

    if (!/^[A-Za-z_]/.test(nameToken.value)) {
      this.error(nameToken, "A property name starts with a letter or `_`.", "bad-name");
    }

    this.index += 2;
    const value = this.value(equals);
    const colon = nameToken.value.indexOf(":");
    const entry: Entry = {
      name: nameToken.value,
      base: colon >= 0 ? nameToken.value.slice(0, colon) : nameToken.value,
      key: colon >= 0 ? nameToken.value.slice(colon + 1) : undefined,
      nameRange: { start: nameToken.start, end: nameToken.end },
      value,
      range: { start: nameToken.start, end: value?.range.end ?? equals.end },
    };
    if (!value) this.recover(inBlock);
    return entry;
  }

  /** A value; on failure reports why and returns undefined without consuming the offending token. */
  private value(after: Token): Value | undefined {
    const t = this.peek();
    if (!t) {
      this.error(after, "Expected a value after `=`.", "expected-value");
      return undefined;
    }
    switch (t.kind) {
      case "string":
        this.index++;
        return { kind: "string", text: t.value, range: { start: t.start, end: t.end } };
      case "word": {
        if (NUMBER.test(t.value)) {
          this.index++;
          return { kind: "number", text: t.value, value: Number(t.value), range: { start: t.start, end: t.end } };
        }
        if (/^(true|false)$/i.test(t.value)) {
          this.index++;
          return { kind: "boolean", value: t.value.toLowerCase() === "true", range: { start: t.start, end: t.end } };
        }
        const at = t.value.indexOf("@");
        if (at > 0) {
          this.error(t, `To refer to another namespace, write @ref("${t.value.slice(0, at)}", "${t.value.slice(at + 1)}").`, "bare-reference");
        } else if (/^[A-Za-z_]/.test(t.value)) {
          this.error(t, `Text goes in double quotes: "${t.value}".`, "unquoted-text");
        } else {
          this.error(t, `\`${t.value}\` is not a value: expected text in quotes, a number, true or false, @ref(...), { ... } or [ ... ].`, "bad-value");
        }
        return undefined;
      }
      case "at":
        return this.reference();
      case "lbrace":
        return this.block();
      case "lbracket":
        return this.list();
      default:
        this.error(t, `Expected a value, but found ${describe(t)}.`, "expected-value");
        return undefined;
    }
  }

  /** `@ref("name")`, `@ref("name", "namespace")`, `@ref(id)`, `@prompt("name")` or `@json("name")`. */
  private reference(): Value | undefined {
    const at = this.peek()!;
    const directive = this.peek(1);
    const open = this.peek(2);
    if (!directive || directive.kind !== "word") {
      this.error(at, "Expected @ref(...), @prompt(...) or @json(...).", "bad-directive");
      return undefined;
    }
    if (!["ref", "prompt", "json"].includes(directive.value)) {
      this.error({ start: at.start, end: directive.end }, `@${directive.value} is not something a file can use: write @ref(...), @prompt(...) or @json(...).`, "unknown-directive");
      return undefined;
    }
    if (!open || open.kind !== "lparen") {
      this.error({ start: at.start, end: directive.end }, `Expected ( after @${directive.value}.`, "bad-directive");
      return undefined;
    }

    const first = this.peek(3);
    const second = this.peek(4);
    const third = this.peek(5);
    const fourth = this.peek(6);
    const whole = (last: Token): Range => ({ start: at.start, end: last.end });
    const range = (t: Token): Range => ({ start: t.start, end: t.end });

    if (directive.value !== "ref") {
      if (first?.kind === "string" && second?.kind === "rparen") {
        this.index += 5;
        if (first.value.trim() === "") this.error(first, "Name the file to include.", "empty-include");
        return { kind: "include", directive: directive.value as "prompt" | "json", name: first.value, nameRange: range(first), range: whole(second) };
      }
      this.error(first ?? open, `Write @${directive.value}("name"): the name in double quotes.`, "bad-include");
      return undefined;
    }

    if (first?.kind === "word" && second?.kind === "rparen") {
      this.index += 5;
      if (!GUID.test(first.value)) {
        this.error(first, `@ref takes a name in double quotes, or an id: @ref("${first.value}").`, "bad-reference");
      }
      return { kind: "ref", form: "id", id: first.value, nameRange: range(first), range: whole(second) };
    }
    if (first?.kind === "string" && second?.kind === "comma" && third?.kind === "string" && fourth?.kind === "rparen") {
      this.index += 7;
      if (first.value.trim() === "") this.error(first, "Name what the reference is to.", "empty-reference");
      if (third.value.trim() === "") this.error(third, "Name the namespace.", "empty-reference");
      return { kind: "ref", form: "namespaced", name: first.value, namespace: third.value, nameRange: range(first), range: whole(fourth) };
    }
    if (first?.kind === "string" && second?.kind === "rparen") {
      this.index += 5;
      if (first.value.trim() === "") this.error(first, "Name what the reference is to.", "empty-reference");
      return { kind: "ref", form: "name", name: first.value, nameRange: range(first), range: whole(second) };
    }
    this.error(first ?? open, 'Write @ref("name"), @ref("name", "namespace") or @ref(id).', "bad-reference");
    return undefined;
  }

  private block(): Value | undefined {
    const open = this.next()!;
    const entries = this.entries(true);
    const close = this.peek();
    if (!close) {
      this.error(open, "This { is never closed.", "unclosed-block");
      return { kind: "block", entries, open: { start: open.start, end: open.end }, range: { start: open.start, end: this.text.length } };
    }
    this.index++;
    return { kind: "block", entries, open: { start: open.start, end: open.end }, close: { start: close.start, end: close.end }, range: { start: open.start, end: close.end } };
  }

  private list(): Value | undefined {
    const open = this.next()!;
    const items: Value[] = [];
    for (;;) {
      const t = this.peek();
      if (!t) {
        this.error(open, "This [ is never closed.", "unclosed-list");
        return undefined;
      }
      if (t.kind === "rbracket") {
        this.index++;
        return { kind: "array", items, range: { start: open.start, end: t.end } };
      }
      const item = this.value(open);
      if (!item) return undefined;
      items.push(item);
      const after = this.peek();
      if (after?.kind === "comma") {
        this.index++;
      } else if (after?.kind !== "rbracket") {
        this.error(after ?? item.range, after ? "Put a comma between the items of a list." : "This [ is never closed.", after ? "missing-comma" : "unclosed-list");
        return undefined;
      }
    }
  }
}

function describe(t: Token): string {
  switch (t.kind) {
    case "string":
      return "text";
    case "word":
      return `\`${t.value}\``;
    default:
      return `\`${t.value}\``;
  }
}
