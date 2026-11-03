// Types of scripts/generate-models.mjs, for the unit test that checks the generated files are current.
export type WireType =
  | { kind: "primitive"; name: string }
  | { kind: "named"; name: string }
  | { kind: "array" | "map" | "nullable"; element: WireType };

export function parseWireType(text: string): WireType;
export function generate(packageRoot: string): Record<string, string>;
