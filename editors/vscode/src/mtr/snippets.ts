import { Kind, MtrSchema, objectProperties, Property, ValueShape } from "./schema";

/**
 * A snippet for a new file of a kind: every required property, nested blocks included, with a tab stop for each
 * value. `npm run build` writes one per kind to `snippets/mtr.json`; completion offers the same in an empty file.
 */
export interface Snippet {
  prefix: string;
  body: string[];
  description: string;
}

export function kindSnippet(schema: MtrSchema, kind: Kind): Snippet {
  let stop = 0;
  const lines: string[] = [];

  const value = (shape: ValueShape, property: Property, indent: string): string => {
    switch (shape.type) {
      case "string":
        if (shape.enum && shape.format !== "http-method") return `"\${${++stop}|${shape.enum.map((e) => e.value).join(",")}|}"`;
        if (shape.format === "http-method") return `"\${${++stop}|${shape.enum!.slice(0, 5).map((e) => e.value).join(",")}|}"`;
        if (shape.format === "duration") return `"\${${++stop}:00:05:00}"`;
        if (shape.format === "url") return `"\${${++stop}:https://api.example.com}"`;
        if (shape.format === "json") return `@json("\${${++stop}:schema}")`;
        return `"\${${++stop}:${property.name}}"`;
      case "number":
      case "integer":
        return `\${${++stop}:${typeof property.default === "number" ? property.default : 1}}`;
      case "boolean":
        return `\${${++stop}|true,false|}`;
      case "reference":
        return `@ref("\${${++stop}:${shape.references === "aiModel" ? "provider.model" : "name"}}")`;
      case "object":
        return block(objectProperties(schema, shape) ?? [], indent);
      case "array":
        if (shape.items?.type === "object") return `[\n${indent}\t${block(objectProperties(schema, shape) ?? [], `${indent}\t`)}\n${indent}]`;
        return `[ ${value(shape.items!, property, indent)} ]`;
      case "map":
        return `"\${${++stop}}"`;
    }
  };

  const block = (properties: Property[], indent: string): string => {
    const required = properties.filter((p) => p.required);
    if (required.length === 0) return "{ }";
    return `{\n${required.map((p) => `${indent}\t${p.name} = ${value(p, p, `${indent}\t`)}`).join("\n")}\n${indent}}`;
  };

  for (const property of kind.properties.filter((p) => p.required)) {
    lines.push(...`${property.name} = ${value(property, property, "")}`.split("\n"));
  }
  if (lines.length === 0) lines.push(`// ${kind.title}: every property is optional.`);
  lines.push("$0");

  return {
    prefix: `mtr-${kind.id}`,
    body: lines,
    description: `A new ${kind.title.toLowerCase()} file (${kind.folder}/): every required property.`,
  };
}

/** The contents of `snippets/mtr.json`: one snippet per kind, in schema order. */
export function snippetsFile(schema: MtrSchema): Record<string, Snippet> {
  const out: Record<string, Snippet> = {};
  for (const kind of schema.kinds) out[kind.title] = kindSnippet(schema, kind);
  return out;
}
