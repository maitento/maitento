import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SDK_VERSION } from "../src/index.js";
import { CODEC_TABLE } from "../src/codec-table.js";
import { generate, parseWireType } from "../scripts/generate-models.mjs";

const packageRoot = join(import.meta.dirname, "..");

describe("generated SDK model layer", () => {
  it("src/models.ts and src/codec-table.ts match ../models.json (run `npm run generate`)", async () => {
    const files = generate(packageRoot);
    for (const [path, content] of Object.entries(files)) {
      const committed = (await readFile(join(packageRoot, path), "utf8")).replace(/\r\n/g, "\n");
      expect(committed, path).toBe(content);
    }
  });

  it("parses the wire type notation", () => {
    const parse = parseWireType;
    expect(parse("map<string, string | null> | null")).toEqual({
      kind: "nullable",
      element: { kind: "map", element: { kind: "nullable", element: { kind: "primitive", name: "string" } } },
    });
    expect(parse("(Agent | null)[]")).toEqual({
      kind: "array",
      element: { kind: "nullable", element: { kind: "named", name: "Agent" } },
    });
    expect(() => parse("A | B")).toThrow();
  });

  it("knows every polymorphic base and the fields to convert", () => {
    expect(CODEC_TABLE.Interaction?.u?.[0]).toBe("$type");
    expect(CODEC_TABLE.CodePipelineProcessCredentialsInput?.u?.[0]).toBe("type");
    expect(CODEC_TABLE.InteractionProcess?.f?.executionTime).toBe("timespan");
    expect(CODEC_TABLE.InteractionProcess?.f?.dateCreated).toBe("datetime");
    expect(CODEC_TABLE.OneShotInteraction?.d).toEqual(["$type", "one-shot"]);
  });

  it("SDK_VERSION is the package version", async () => {
    const pkg = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as { version: string };
    expect(SDK_VERSION).toBe(pkg.version);
  });
});
