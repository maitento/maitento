import * as path from "path";
import { Entry, Issue, parse, ParseResult, Range, Severity, Value } from "./parser";
import { Placement, ProjectIndex } from "./project";
import { describeShape, MtrSchema, Property, ValueShape } from "./schema";

/**
 * Checks a `.mtr` file against the schema the way a build would: every property known and set once, every required
 * property present, every value of the right shape, every `@prompt` / `@json` file found, and every `@ref` to something
 * the project declares. Also records what each name and value is, for hovers.
 */
export interface Annotation {
  range: Range;
  type: "property" | "enum" | "ref" | "include";
  property?: Property;
  /** The property's path: `agent`, `agent/name`, `inputs.prompts[]/name`. */
  path?: string;
  enumValue?: { value: string; description?: string };
  target?: string;
  name?: string;
  directive?: string;
  /** The files a reference or include resolves to. */
  files?: string[];
}

export interface AnalyzeOptions {
  schema: MtrSchema;
  /** Where the file sits. Without it only the syntax is checked. */
  placement?: Placement;
  /** The project the file is in, for references, includes and names. */
  project?: ProjectIndex;
  /** The file's absolute path. */
  file?: string;
}

export interface Analysis {
  parse: ParseResult;
  issues: Issue[];
  annotations: Annotation[];
}

export function analyze(text: string, options: AnalyzeOptions): Analysis {
  const parsed = parse(text);
  const analysis: Analysis = { parse: parsed, issues: [...parsed.issues], annotations: [] };
  if (options.placement) new Checker(options, analysis, parsed.issues.length > 0, text).run(parsed);
  return analysis;
}

const MAX_SHOWN = 72;

class Checker {
  private readonly schema: MtrSchema;

  constructor(
    private readonly options: AnalyzeOptions,
    private readonly analysis: Analysis,
    private readonly hasSyntaxErrors: boolean,
    private readonly text: string,
  ) {
    this.schema = options.schema;
  }

  run(parsed: ParseResult): void {
    const kind = this.options.placement!.kind;
    const firstLine: Range = { start: 0, end: Math.max(0, this.text.search(/\r?\n|$/)) };
    this.fileChecks(firstLine);
    const anchor = parsed.entries[0]?.nameRange ?? firstLine;
    this.entries(parsed.entries, kind.properties, "", `this ${kind.title.toLowerCase()} file`, anchor);
  }

  private issue(range: Range, message: string, severity: Severity, code: string): void {
    this.analysis.issues.push({ range, message, severity, code });
  }

  private relative(file: string): string {
    const root = this.options.project?.root;
    return (root ? path.relative(root, file) : file).split(path.sep).join("/");
  }

  /** The file's name and its place in the project. */
  private fileChecks(firstLine: Range): void {
    const { placement, project, file } = this.options;
    const { kind, name } = placement!;
    const rule = this.schema.syntax.resourceNames;
    if (!new RegExp(rule.pattern).test(name) || name.length > rule.maxLength || name.includes("..")) {
      this.issue(firstLine, `"${name}" is not a name Maitento accepts. ${rule.description}`, "warning", "bad-resource-name");
    }
    if (!project || !file) return;

    if (kind.perSubfolder) {
      const app = project.apps.get(name);
      if (app && kind.maxFiles && app.mtr.length > kind.maxFiles) {
        this.issue(firstLine, `An app folder holds at most ${kind.maxFiles} .mtr file; a deploy skips this app. Also here: ${app.mtr.filter((f) => f !== file).map((f) => this.relative(f)).join(", ")}.`, "error", "too-many-files");
      }
      if (app && app.mtc.length === 0) {
        this.issue(firstLine, "This app has no .mtc code beside it, so a deploy skips it.", "warning", "app-without-code");
      }
      return;
    }

    const others = project.find([kind.id], name).filter((f) => path.resolve(f) !== path.resolve(file));
    if (others.length) {
      this.issue(firstLine, `Another ${kind.title.toLowerCase()} has the name "${name}" (names ignore capitals, and sub-folders do not count): ${others.map((f) => this.relative(f)).join(", ")}.`, "error", "duplicate-name");
    }
  }

  private entries(entries: Entry[], properties: Property[], prefix: string, scope: string, anchor: Range): void {
    const seen = new Map<string, Entry>();
    for (const entry of entries) {
      const property = properties.find((p) => p.name === entry.base);
      if (!property) {
        this.unknown(entry, properties, scope);
        continue;
      }

      const at = prefix + property.name;
      this.analysis.annotations.push({ range: entry.nameRange, type: "property", property, path: at });

      if (entry.key !== undefined) {
        if (property.type !== "map") {
          this.issue(entry.nameRange, `\`${property.name}\` is not a map: write \`${property.name} = ...\`.`, "error", "not-a-map");
        } else if (entry.key === "") {
          this.issue(entry.nameRange, `Name the key: \`${property.name}:<key> = "value"\`.`, "error", "empty-key");
        } else if (entry.value) {
          this.textValue(entry.value, { type: "string" }, property, at);
        }
        continue;
      }
      if (property.type === "map") {
        this.issue(entry.nameRange, `\`${property.name}\` takes one line per entry: \`${property.name}:<key> = "value"\`.`, "error", "map-without-key");
        continue;
      }

      const earlier = seen.get(property.name);
      if (earlier) {
        this.issue(entry.nameRange, `\`${property.name}\` is already set${scope.startsWith("this") ? " in this file" : ` in ${scope}`}: set each property once.`, "error", "duplicate-property");
      }
      seen.set(property.name, entry);
      if (entry.value) this.value(entry.value, property, property, at, false);
    }

    if (this.hasSyntaxErrors) return;
    const set = new Set(entries.map((e) => e.base));
    const missing = properties.filter((p) => p.required && !set.has(p.name));
    if (missing.length) {
      const names = missing.map((p) => `\`${p.name}\``);
      this.issue(anchor, `${capitalise(scope)} needs ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`}.`, "error", "missing-required");
    }
  }

  private unknown(entry: Entry, properties: Property[], scope: string): void {
    let hint = "";
    const dotted = properties.find((p) => p.name.startsWith(`${entry.base}.`));
    const head = entry.base.split(".")[0]!;
    const block = entry.base.includes(".") ? properties.find((p) => p.name === head && (p.type === "object" || p.type === "array")) : undefined;
    const near = closest(entry.base, properties.map((p) => p.name));
    if (near) hint = ` Did you mean \`${near}\`?`;
    else if (dotted) hint = ` A name with dots is one name: did you mean \`${dotted.name} = ...\`?`;
    else if (block) hint = ` Set it inside the block: \`${head} = { ${entry.base.slice(head.length + 1)} = ... }\`.`;
    this.issue(entry.nameRange, `\`${entry.base}\` is not a property of ${scope}.${hint}`, "error", "unknown-property");
  }

  /** A value against the shape its property (or its list's items) takes. */
  private value(value: Value, shape: ValueShape, property: Property, at: string, inList: boolean): void {
    switch (shape.type) {
      case "string":
        return this.textValue(value, shape, property, at, inList);
      case "number":
      case "integer":
        if (value.kind !== "number") return this.expected(value, shape, property);
        if (shape.type === "integer" && !Number.isInteger(value.value)) {
          this.issue(value.range, `\`${property.name}\` is a whole number: ${value.text} is read as ${Math.trunc(value.value)}.`, "warning", "not-whole");
        }
        return;
      case "boolean":
        if (value.kind === "boolean") return;
        if (value.kind === "string" && /^(true|false)$/i.test(value.text.trim())) {
          this.issue(value.range, `true and false have no quotes: \`${property.name} = ${value.text.trim().toLowerCase()}\`.`, "error", "quoted-boolean");
          return;
        }
        return this.expected(value, shape, property);
      case "reference":
        if (value.kind !== "ref") return this.expected(value, shape, property);
        return this.reference(value, shape.references!);
      case "object": {
        if (value.kind !== "block") return this.expected(value, shape, property);
        const type = this.schema.types[shape.object!];
        if (type) this.entries(value.entries, type.properties, `${at}/`, `the \`${property.name}\` block`, value.open);
        return;
      }
      case "array":
        if (value.kind !== "array") return this.expected(value, shape, property);
        if (value.items.length === 0) {
          this.issue(value.range, `A list cannot be empty: leave \`${property.name}\` out instead.`, "error", "empty-list");
          return;
        }
        for (const item of value.items) {
          if (shape.items!.type === "object" && item.kind === "block") {
            const type = this.schema.types[shape.items!.object!];
            if (type) this.entries(item.entries, type.properties, `${at}[]/`, `an item of \`${property.name}\``, item.open);
          } else {
            this.value(item, shape.items!, property, `${at}[]`, true);
          }
        }
        return;
      case "map":
        return;
    }
  }

  private expected(value: Value, shape: ValueShape, property: Property): void {
    if (value.kind === "include") this.include(value, property, false);
    const found = value.kind === "include" ? `@${value.directive}(...), which gives text` : describeValue(value);
    this.issue(value.range, `\`${property.name}\` takes ${describeShape(this.schema, shape)}, not ${found}.`, "error", "wrong-type");
  }

  /** A text value, or an include (which gives text). */
  private textValue(value: Value, shape: ValueShape, property: Property, at: string, inList = false): void {
    if (value.kind === "include") {
      if (inList) this.issue(value.range, `@${value.directive}(...) cannot be an item of a list: it gives the value of a text property.`, "error", "include-in-list");
      const content = this.include(value, property, true);
      if (content !== undefined && shape.format === "json") {
        this.json(content, value.range, property, value.directive === "json" ? `json/${value.name}.json` : `prompts/${value.name}.md`);
      }
      return;
    }
    if (value.kind !== "string") return this.expected(value, shape, property);

    const text = value.text;
    if (shape.enum && shape.format !== "http-method") {
      const match = shape.enum.find((e) => e.value.toLowerCase() === text.trim().toLowerCase());
      if (match) {
        this.analysis.annotations.push({ range: value.range, type: "enum", property, path: at, enumValue: match });
      } else if (/^\d+$/.test(text.trim())) {
        this.issue(value.range, `Write the value's name: ${shape.enum.map((e) => `"${e.value}"`).join(", ")}.`, "warning", "numeric-enum");
      } else {
        this.issue(value.range, `"${shorten(text)}" is not one of ${shape.enum.map((e) => `"${e.value}"`).join(", ")}.`, "error", "bad-enum");
      }
      return;
    }

    switch (shape.format) {
      case "duration": {
        const problem = durationProblem(text);
        if (problem) this.issue(value.range, problem.message, problem.severity, "bad-duration");
        return;
      }
      case "url":
        if (!isAbsoluteUrl(text)) this.issue(value.range, `"${shorten(text)}" is not a full URL, such as "https://api.example.com/orders/{orderId}".`, "error", "bad-url");
        return;
      case "http-method": {
        const known = shape.enum?.find((e) => e.value.toLowerCase() === text.trim().toLowerCase());
        if (known) {
          this.analysis.annotations.push({ range: value.range, type: "enum", property, path: at, enumValue: known });
        } else if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(text)) {
          this.issue(value.range, `"${shorten(text)}" is not an HTTP method.`, "error", "bad-method");
        } else {
          this.issue(value.range, `"${shorten(text)}" is not a method Maitento knows; it is usually ${shape.enum!.slice(0, 5).map((e) => `"${e.value}"`).join(", ")}.`, "warning", "unknown-method");
        }
        return;
      }
      case "json":
        this.json(text, value.range, property, undefined);
        return;
    }
  }

  /** JSON text for a JSON property: it must parse, and be an object. `file` names an included file. */
  private json(content: string, range: Range, property: Property, file: string | undefined): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content.replace(/^﻿/, ""));
    } catch (error) {
      const reason = (error as Error).message;
      this.issue(range, file
        ? `${file} is not valid JSON: ${reason}`
        : `This is not valid JSON: ${reason}. Text is taken exactly as written, so put JSON with quotes in a json/ file and use @json("name").`, "error", "bad-json");
      return;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      this.issue(range, `\`${property.name}\` takes a JSON object, such as a JSON Schema${file ? `, and ${file} holds something else` : ""}.`, "error", "json-not-object");
    }
  }

  /** Resolves an include; returns the file's text when it is found. */
  private include(value: Extract<Value, { kind: "include" }>, property: Property, record: boolean): string | undefined {
    const project = this.options.project;
    if (!project || value.name.trim() === "") return undefined;
    const files = (value.directive === "prompt" ? project.prompts : project.json).get(value.name) ?? [];
    if (record) this.analysis.annotations.push({ range: value.range, type: "include", property, directive: value.directive, name: value.name, files });
    const folder = value.directive === "prompt" ? "prompts" : "json";
    const extension = value.directive === "prompt" ? ".md" : ".json";
    if (files.length === 0) {
      this.issue(value.nameRange, `There is no ${folder}/${value.name}${extension} in this project (the name is the file name without ${extension}, in any sub-folder of ${folder}/).`, "error", "include-not-found");
      return undefined;
    }
    if (files.length > 1) {
      this.issue(value.nameRange, `More than one file is named ${value.name}${extension}: ${files.map((f) => this.relative(f)).join(", ")}. Only one is used, so give them different names.`, "warning", "include-ambiguous");
    }
    const content = project.read(files[0]!);
    if (content !== undefined && value.directive === "prompt") {
      for (const problem of templateProblems(content)) {
        this.issue(value.range, `${this.relative(files[0]!)}: ${problem}`, "error", "bad-template");
      }
    }
    return content;
  }

  private reference(value: Extract<Value, { kind: "ref" }>, targetId: string): void {
    const target = this.schema.referenceTargets[targetId];
    const project = this.options.project;
    const files = value.form === "name" && project && target?.kinds.length ? project.find(target.kinds, value.name!) : undefined;
    this.analysis.annotations.push({ range: value.range, type: "ref", target: targetId, name: value.name ?? value.id, files });
    if (!target || value.form !== "name" || !project || target.kinds.length === 0 || !value.name?.trim()) return;
    if (files!.length === 0) {
      this.issue(value.nameRange ?? value.range, `There is no ${target.title} named "${value.name}" in this project. It must already exist in the namespace you deploy to.`, "warning", "reference-not-found");
    }
  }
}

/** How the build reads a duration (.NET's TimeSpan): `"hh:mm:ss"`, `"hh:mm"`, `"d.hh:mm:ss"`, or a number of days. */
export function durationProblem(text: string): { message: string; severity: Severity } | undefined {
  const t = text.trim();
  if (/^-?\d+$/.test(t)) {
    return { message: `"${t}" is read as ${t} day${t === "1" ? "" : "s"}. Write a duration as "hh:mm:ss", such as "00:05:00".`, severity: "warning" };
  }
  const m = /^-?(?:(\d+)\.)?(\d+):(\d+)(?::(\d+)(?:\.\d{1,7})?)?$/.exec(t);
  if (!m || Number(m[3]) > 59 || (m[4] !== undefined && Number(m[4]) > 59) || (m[1] !== undefined && Number(m[2]) > 23)) {
    return { message: `"${shorten(t)}" is not a duration: write "hh:mm:ss", such as "00:05:00" for five minutes.`, severity: "error" };
  }
  if (m[1] === undefined && Number(m[2]) > 23) {
    return { message: `"${t}" is read as ${Number(m[2])} days, not hours. Write "1.00:00:00" for one day.`, severity: "warning" };
  }
  return undefined;
}

/** The checks the build makes on a prompt file's `{{#if}}` / `{{#unless}}` blocks. */
export function templateProblems(content: string): string[] {
  const problems: string[] = [];
  const count = (needle: string): number => content.toLowerCase().split(needle.toLowerCase()).length - 1;
  for (const block of ["if", "unless"]) {
    const opened = count(`{{#${block} `);
    const closed = count(`{{/${block}}}`);
    if (opened !== closed) problems.push(`its {{#${block}}} blocks do not match: ${opened} opened, ${closed} closed.`);
    let from = 0;
    const lower = content.toLowerCase();
    for (;;) {
      const tag = lower.indexOf(`{{#${block} `, from);
      if (tag < 0) break;
      const varStart = tag + block.length + 4;
      const close = content.indexOf("}}", varStart);
      if (close < 0) {
        problems.push(`a {{#${block} ...}} tag is never closed.`);
        break;
      }
      if (content.slice(varStart, close).trim() === "") problems.push(`a {{#${block}}} tag names no input.`);
      from = close + 2;
    }
  }
  return problems;
}

function isAbsoluteUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol.length > 1;
  } catch {
    return false;
  }
}

function describeValue(value: Value): string {
  switch (value.kind) {
    case "string":
      return "text";
    case "number":
      return "a number";
    case "boolean":
      return "true or false";
    case "ref":
      return "a reference";
    case "include":
      return `@${value.directive}(...)`;
    case "block":
      return "a block";
    case "array":
      return "a list";
  }
}

const shorten = (text: string): string => (text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN - 1)}…` : text);
const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The candidate nearest to a misspelt name (same letters ignoring case, or within two edits), if any. */
export function closest(name: string, candidates: string[]): string | undefined {
  let best: { candidate: string; distance: number } | undefined;
  for (const candidate of candidates) {
    const distance = candidate.toLowerCase() === name.toLowerCase() ? 0 : editDistance(name.toLowerCase(), candidate.toLowerCase());
    if (distance <= Math.max(2, Math.floor(candidate.length / 4)) && (!best || distance < best.distance)) best = { candidate, distance };
  }
  return best?.candidate;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}
