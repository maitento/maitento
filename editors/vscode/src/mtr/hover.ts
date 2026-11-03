import * as path from "path";
import { Analysis, Annotation } from "./analyzer";
import { docsUrl } from "./docs";
import { Range } from "./parser";
import { Placement, ProjectIndex } from "./project";
import { describeShape, MtrSchema } from "./schema";

export interface HoverOptions {
  schema: MtrSchema;
  placement?: Placement;
  project?: ProjectIndex;
}

/** Markdown for what is under the cursor: a property, a value, a reference or an included file. */
export function hoverAt(analysis: Analysis, offset: number, options: HoverOptions): { markdown: string; range: Range } | undefined {
  const annotation = analysis.annotations
    .filter((a) => a.range.start <= offset && offset <= a.range.end)
    .sort((a, b) => (a.range.end - a.range.start) - (b.range.end - b.range.start))[0];
  if (!annotation) return undefined;
  return { markdown: render(annotation, options), range: annotation.range };
}

function render(a: Annotation, options: HoverOptions): string {
  const { schema, placement, project } = options;
  const relative = (file: string): string => (project ? path.relative(project.root, file) : file).split(path.sep).join("/");
  switch (a.type) {
    case "property": {
      const p = a.property!;
      const facts = [describeShape(schema, p), p.required ? "required" : "optional"];
      if (p.default !== undefined) facts.push(`default \`${JSON.stringify(p.default)}\``);
      const lines = [`**\`${p.name}\`** — ${facts.join(" · ")}`, "", p.description];
      if (p.enum && p.format !== "http-method") {
        lines.push("", ...p.enum.map((e) => `- \`${e.value}\`${e.description ? `: ${e.description}` : ""}`));
      }
      const target = schema.referenceTargets[p.references ?? p.items?.references ?? ""];
      if (target?.source) lines.push("", target.source);
      const url = placement ? docsUrl(placement.kind.id, a.path) : undefined;
      if (url) lines.push("", `[Reference](${url})`);
      return lines.join("\n");
    }
    case "enum":
      return [`**\`"${a.enumValue!.value}"\`**`, "", a.enumValue!.description ?? `A value of \`${a.property!.name}\`.`].join("\n");
    case "ref": {
      const target = schema.referenceTargets[a.target ?? ""];
      const lines = [`**${target?.title ?? "reference"}** \`${a.name ?? ""}\``];
      if (a.files?.length) lines.push("", ...a.files.map((f) => `Declared in \`${relative(f)}\``));
      else if (target?.source) lines.push("", target.source);
      else if (a.files) lines.push("", "Not declared in this project: it must already exist in the namespace you deploy to.");
      return lines.join("\n");
    }
    case "include": {
      const lines = [`**@${a.directive}("${a.name}")**`];
      if (!a.files?.length) return [...lines, "", "No such file in this project."].join("\n");
      lines.push("", `\`${relative(a.files[0]!)}\``);
      const text = project?.read(a.files[0]!);
      if (text !== undefined) {
        const preview = text.replace(/^﻿/, "").split(/\r?\n/).slice(0, 12).join("\n");
        lines.push("", "```" + (a.directive === "json" ? "json" : "markdown"), preview, "```");
      }
      return lines.join("\n");
    }
  }
}
