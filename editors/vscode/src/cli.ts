#!/usr/bin/env node
import * as path from "path";
import { analyze } from "./mtr/analyzer";
import { nodeFileSystem } from "./mtr/nodeFileSystem";
import { Severity } from "./mtr/parser";
import { placeFile, ProjectIndex } from "./mtr/project";
import { bundledSchemaPath, loadSchema, MtrSchema } from "./mtr/schema";

/**
 * Checks every `.mtr` file of a project folder the way the editor does, and prints what it finds:
 *
 *   node out/src/cli.js <project folder> [--errors-only] [--schema <mtr-schema.json>]
 *
 * Exits 1 when there is an error.
 */
export interface Finding {
  file: string;
  line: number;
  column: number;
  severity: Severity;
  code: string;
  message: string;
}

export function checkProject(root: string, schema: MtrSchema): Finding[] {
  const project = new ProjectIndex(root, schema, nodeFileSystem);
  const findings: Finding[] = [];
  for (const file of walk(root)) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    const placement = placeFile(schema, relative);
    const text = nodeFileSystem.read(file) ?? "";
    const { issues } = analyze(text, { schema, placement, project, file });
    for (const issue of issues) {
      const { line, column } = position(text, issue.range.start);
      findings.push({ file: relative, line, column, severity: issue.severity, code: issue.code, message: issue.message });
    }
  }
  return findings;
}

function walk(dir: string): string[] {
  return nodeFileSystem.list(dir).sort().flatMap((name) => {
    const full = path.join(dir, name);
    if (nodeFileSystem.isDirectory(full)) return name === "node_modules" || name.startsWith(".") ? [] : walk(full);
    return name.toLowerCase().endsWith(".mtr") ? [full] : [];
  });
}

function position(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset).split(/\r?\n/);
  return { line: before.length, column: before[before.length - 1]!.length + 1 };
}

function main(argv: string[]): number {
  const args = [...argv];
  const errorsOnly = args.includes("--errors-only");
  const schemaAt = args.indexOf("--schema");
  const schemaFile = schemaAt >= 0 ? args[schemaAt + 1] : undefined;
  const folder = args.find((a, i) => !a.startsWith("--") && (schemaAt < 0 || i !== schemaAt + 1));
  if (!folder || !nodeFileSystem.isDirectory(folder)) {
    console.error("Usage: node out/src/cli.js <project folder> [--errors-only] [--schema <mtr-schema.json>]");
    return 2;
  }
  const schema = loadSchema(schemaFile ?? bundledSchemaPath());
  const findings = checkProject(path.resolve(folder), schema).filter((f) => !errorsOnly || f.severity === "error");
  for (const f of findings) console.log(`${f.file}:${f.line}:${f.column}: ${f.severity} ${f.code}: ${f.message}`);
  const errors = findings.filter((f) => f.severity === "error").length;
  console.log(`${findings.length} finding(s), ${errors} error(s).`);
  return errors > 0 ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
