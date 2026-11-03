import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BuildFailedError, ProjectError, buildRequestFromProject, type ProjectFiles } from "../src/index.js";
import { readProjectFolder } from "../src/deploy/node.js";
import { json, testClient } from "./helpers.js";

const HELLO: ProjectFiles = {
  "agents/greeter.mtr": 'model = @ref("deepseek.deepseek-v4-flash")\r\nprompt = @prompt("greeter")\r\nsummary = "Says hello"',
  "interactions/one-shot/hello.mtr": 'agent = {\n  name = "Greeter"\n  agent = @ref("greeter")\n}\ntask = "Say hello."\n',
  "prompts/greeter.md": "You are warm and brief.",
};

describe("buildRequestFromProject: the mt build/deploy layout", () => {
  it("maps every resource folder, keeping file names relative to their folder", () => {
    const request = buildRequestFromProject(
      {
        ...HELLO,
        "agents/team/router.mtr": "model = x",
        "capsules/sandbox.mtr": 'template = "python"',
        "looms/support-memory.mtr": 'description = "memory"',
        "connectors/open-api/orders-get.mtr": 'url = "https://api.example.com/orders"',
        "external-operations/open-api/get-order.mtr": 'connector = @ref("orders-get")',
        "interactions/round-robin/chat.mtr": "x = 1",
        "interactions/managed/team.mtr": "x = 2",
        "json/schemas/answer.json": '{"type":"object"}',
        "prompts/nested/system.md": "System text",
        "README.md": "# not part of the build",
        "notes/ignored.mtr": "ignored = true",
      },
      true,
    );
    expect(request.isDeploy).toBe(true);
    expect(request.agents).toEqual([
      { name: "greeter", filename: "greeter.mtr", lines: ['model = @ref("deepseek.deepseek-v4-flash")', 'prompt = @prompt("greeter")', 'summary = "Says hello"'] },
      { name: "router", filename: "team/router.mtr", lines: ["model = x"] },
    ]);
    expect(request.capsules.map((c) => c.name)).toEqual(["sandbox"]);
    expect(request.looms?.map((l) => l.name)).toEqual(["support-memory"]);
    expect(request.connectors).toEqual({
      openApi: [{ name: "orders-get", filename: "orders-get.mtr", lines: ['url = "https://api.example.com/orders"'] }],
      modelContextProtocol: [],
    });
    expect(request.externalOperations.openApi.map((t) => t.name)).toEqual(["get-order"]);
    expect(request.interactions.oneShot.map((i) => i.filename)).toEqual(["hello.mtr"]);
    expect(request.interactions.oneShot[0]?.lines).toEqual([
      "agent = {",
      '  name = "Greeter"',
      '  agent = @ref("greeter")',
      "}",
      'task = "Say hello."',
      "",
    ]);
    expect(request.interactions.roundRobin.map((i) => i.name)).toEqual(["chat"]);
    expect(request.interactions.managed.map((i) => i.name)).toEqual(["team"]);
    // prompts/ and json/ are flattened: referenced by file name without extension, whatever the sub-folder.
    expect(request.resourceFiles).toEqual({
      prompts: [
        { name: "greeter", content: "You are warm and brief." },
        { name: "system", content: "System text" },
      ],
      json: [{ name: "answer", content: '{"type":"object"}' }],
    });
    expect(request.apps).toEqual([]);
    expect(request.codePipelines).toEqual([]);
    expect(request.codePipelineHooks).toBeNull();
  });

  it("normalizes Windows and ./-prefixed paths", () => {
    const request = buildRequestFromProject({ ".\\agents\\greeter.mtr": "a = 1", "/agents/other.mtr": "b = 2" }, false);
    expect(request.isDeploy).toBe(false);
    expect(request.agents.map((a) => a.filename)).toEqual(["greeter.mtr", "other.mtr"]);
  });

  it("builds apps from their .mtc files plus at most one .mtr as metadata", () => {
    const request = buildRequestFromProject(
      {
        "apps/refund-flow/refund-flow.mtr": 'description = "Refunds"',
        "apps/refund-flow/main.mtc": "int main() {\n  return 0;\n}",
        "apps/refund-flow/lib/helpers.mtc": "string helper() { return \"x\"; }",
        "apps/script-only/main.mtc": "int main() { return 1; }",
      },
      true,
    );
    expect(request.apps).toEqual([
      {
        name: "refund-flow",
        metadata: { filename: "refund-flow.mtr", lines: ['description = "Refunds"'] },
        code: [
          { filename: "lib/helpers.mtc", lines: ['string helper() { return "x"; }'] },
          { filename: "main.mtc", lines: ["int main() {", "  return 0;", "}"] },
        ],
      },
      { name: "script-only", metadata: null, code: [{ filename: "main.mtc", lines: ["int main() { return 1; }"] }] },
    ]);
  });

  it("skips, with the mt warning, an app with no code and an app with two .mtr files", () => {
    const warnings: string[] = [];
    const request = buildRequestFromProject(
      {
        ...HELLO,
        "apps/empty/empty.mtr": "x = 1",
        "apps/twice/a.mtr": "x = 1",
        "apps/twice/b.mtr": "x = 2",
        "apps/twice/main.mtc": "int main() { return 0; }",
      },
      true,
      (message) => warnings.push(message),
    );
    expect(request.apps).toEqual([]);
    expect(warnings).toEqual(["App 'empty' skipped as no code files", "App 'twice' has more than one resource defined"]);
  });

  it("resolves a pipeline's @prompt and @schema includes client-side, as JSON strings", () => {
    const definition = JSON.stringify(
      {
        name: "fix-bug",
        phases: [{ steps: [{ prompt: "@prompt(plan)", outputSchema: "@schema(verdict)", tool: "@externalOp(tools/get-order)" }] }],
      },
      null,
      2,
    );
    const prompt = 'Plan the fix.\nQuote "carefully" and use \\ paths.';
    const schema = '{\n  "type": "object",\n  "properties": { "ok": { "type": "boolean" } }\n}';
    const request = buildRequestFromProject(
      {
        "code-pipelines/fix-bug/pipeline-definition.json": definition,
        "code-pipelines/fix-bug/prompts/plan.md": prompt,
        "code-pipelines/fix-bug/verdict.schema.json": schema,
        "code-pipelines/no-definition/prompts/x.md": "orphan",
      },
      true,
    );
    expect(request.codePipelines).toHaveLength(1);
    const pipeline = request.codePipelines[0]!;
    expect(pipeline.name).toBe("fix-bug");
    expect(pipeline.filename).toBe("code-pipelines/fix-bug/pipeline-definition.json");
    const parsed = JSON.parse(pipeline.json) as { phases: Array<{ steps: Array<Record<string, string>> }> };
    const step = parsed.phases[0]!.steps[0]!;
    expect(step.prompt).toBe(prompt);
    // The schema is embedded AS A STRING (the server stores schemas as opaque strings).
    expect(step.outputSchema).toBe(schema);
    // @externalOp is the server's to resolve.
    expect(step.tool).toBe("@externalOp(tools/get-order)");
    // A pipeline folder's own prompts are not project prompts.
    expect(request.resourceFiles.prompts).toEqual([]);
  });

  it("fails the whole build when a pipeline include is missing, as mt does", () => {
    expect(() =>
      buildRequestFromProject(
        { "code-pipelines/fix-bug/pipeline-definition.json": '{"name":"fix-bug","prompt":"@prompt(missing)"}' },
        true,
      ),
    ).toThrow(new ProjectError("@prompt reference not found: code-pipelines/fix-bug/prompts/missing.md"));
  });

  it("warns about a pipeline folder with no definition", () => {
    const warnings: string[] = [];
    buildRequestFromProject({ ...HELLO, "code-pipelines/draft/prompts/a.md": "x" }, true, (m) => warnings.push(m));
    expect(warnings).toEqual(["CodePipeline folder 'draft' skipped: no pipeline-definition.json"]);
  });

  it("resolves a hook's @promptJson / @schemaJson to JSON-escaped text with doubled backslashes", () => {
    const prompt = 'Say "hi"\nthen stop.';
    const schema = '{"type":"string"}';
    const request = buildRequestFromProject(
      {
        "code-pipelines/code-generator/pipeline-definition.json": '{"name":"code-generator"}',
        "code-pipelines/code-generator/prompts/verdict.md": prompt,
        "code-pipelines/code-generator/verdict-output.schema.json": schema,
        "code-pipeline-hooks/code-generator/hooks.mtc":
          'string AfterPlan(string processId, string methodName) {\n  string p = "@promptJson(code-generator/verdict)";\n  string s = "@schemaJson(code-generator/verdict-output)";\n}',
      },
      true,
    );
    const hook = request.codePipelineHooks?.["code-generator"];
    expect(hook?.name).toBe("code-generator");
    expect(hook?.metadata).toBeNull();
    expect(hook?.code[0]?.filename).toBe("hooks.mtc");
    const source = hook?.code[0]?.lines.join("\n") ?? "";
    // JSON-escape without quotes, a quote as " (as the C# SDK writes it), then every backslash doubled (the
    // Cogniscript assembler unescapes once). A raw quote must never reach the literal: \\" would end it.
    expect(source).toContain('string p = "Say \\\\u0022hi\\\\u0022\\\\nthen stop.";');
    expect(source).toContain('string s = "{\\\\u0022type\\\\u0022:\\\\u0022string\\\\u0022}";');
    const literals = [...source.matchAll(/= "((?:[^"\\]|\\.)*)";/g)].map((m) => m[1] ?? "");
    expect(literals).toHaveLength(2);
    expect(literals.map((l) => JSON.parse(`"${l.replace(/\\\\/g, "\\")}"`))).toEqual([prompt, schema]);
  });

  it("skips a hook whose include does not resolve or escapes its folder, with the mt warning", () => {
    const warnings: string[] = [];
    const request = buildRequestFromProject(
      {
        ...HELLO,
        "code-pipeline-hooks/a/x.mtc": 'string p = "@promptJson(code-generator/missing)";',
        "code-pipeline-hooks/b/x.mtc": 'string p = "@schemaJson(x/../../../etc/passwd)";',
        "code-pipeline-hooks/c/x.mtc": 'string p = "@promptJson(no-slash)";',
        "code-pipeline-hooks/d/readme.md": "no code",
      },
      true,
      (m) => warnings.push(m),
    );
    expect(request.codePipelineHooks).toBeNull();
    expect(warnings).toEqual([
      "CodePipeline hook 'a' include resolution failed: hook 'a': @promptJson reference not found: code-pipelines/code-generator/prompts/missing.md",
      "CodePipeline hook 'b' include resolution failed: hook 'b': @schemaJson('x/../../../etc/passwd') must name a single pipeline and asset, with no path separators, '..' or rooted paths",
      "CodePipeline hook 'c' include resolution failed: hook 'c': @promptJson('no-slash') must be '<pipeline>/<asset>', e.g. 'code-generator/verdict-output'",
      "CodePipeline hook 'd' skipped as no code files",
    ]);
  });

  it("refuses a project with nothing to build", () => {
    expect(() => buildRequestFromProject({ "README.md": "# hi", "prompts/a.md": "x" }, true)).toThrow(ProjectError);
  });
});

describe("readProjectFolder", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "maitento-sdk-project-"));
    await mkdir(join(root, "agents", "team"), { recursive: true });
    await mkdir(join(root, "interactions", "one-shot"), { recursive: true });
    await mkdir(join(root, "node_modules", "x"), { recursive: true });
    await mkdir(join(root, ".git"), { recursive: true });
    await writeFile(join(root, "agents", "greeter.mtr"), "﻿model = x\r\nprompt = y");
    await writeFile(join(root, "agents", "team", "router.mtr"), "model = z");
    await writeFile(join(root, "interactions", "one-shot", "hello.mtr"), "task = \"hi\"");
    await writeFile(join(root, "agents", "notes.txt"), "not a project file");
    await writeFile(join(root, "logo.png"), "png");
    await writeFile(join(root, "node_modules", "x", "pkg.json"), "{}");
    await writeFile(join(root, ".git", "config.json"), "{}");
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reads every .mtr/.mtc/.md/.json below the folder by relative POSIX path, skipping node_modules and dot folders", async () => {
    const files = await readProjectFolder(root);
    expect(Object.keys(files).sort()).toEqual(["agents/greeter.mtr", "agents/team/router.mtr", "interactions/one-shot/hello.mtr"]);
    // The byte-order mark is not text.
    expect(files["agents/greeter.mtr"]).toBe("model = x\r\nprompt = y");
  });

  it("deploys the folder through PUT /namespaces/{ns}/build", async () => {
    const { mt, calls } = testClient(() => json({ isSuccess: true, isDeployed: true, buildId: "b1", log: [] }));
    const response = await mt.deploy(root, { namespace: "sdk tests" });
    expect(response.isDeployed).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.path).toBe("/namespaces/sdk%20tests/build");
    const body = calls[0]?.body as { isDeploy: boolean; agents: Array<{ name: string }> };
    expect(body.isDeploy).toBe(true);
    expect(body.agents.map((a) => a.name)).toEqual(["greeter", "router"]);
  });

  it("names a missing folder", async () => {
    await expect(readProjectFolder(join(root, "nope"))).rejects.toThrow(/Project folder not found/);
  });
});

describe("deploy / validate", () => {
  const failed = {
    isSuccess: false,
    isDeployed: false,
    buildId: null,
    log: [
      { text: "Starting compilation", date: "2026-10-26T10:00:00Z", logLevel: "Information", filename: null, lineNumber: null },
      {
        text: "Property agnet is not supported by OneShotInteractionResource",
        date: "2026-10-26T10:00:01Z",
        logLevel: "Error",
        filename: "hello.mtr",
        lineNumber: 2,
      },
    ],
  };

  it("deploy throws BuildFailedError with the error entries when the sources do not compile", async () => {
    const { mt } = testClient(() => json(failed));
    const error = await mt.deploy(HELLO).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BuildFailedError);
    const build = error as BuildFailedError;
    expect(build.errors).toEqual([
      { text: "Property agnet is not supported by OneShotInteractionResource", filename: "hello.mtr", lineNumber: 2 },
    ]);
    expect(build.message).toContain("hello.mtr:2");
  });

  it("deploy with throwOnFailure: false and validate return the failed response", async () => {
    const { mt, calls } = testClient(() => json(failed));
    expect((await mt.deploy(HELLO, { throwOnFailure: false })).isSuccess).toBe(false);
    const validated = await mt.validate(HELLO);
    expect(validated.isSuccess).toBe(false);
    expect((calls[1]?.body as { isDeploy: boolean }).isDeploy).toBe(false);
    // Dates in the log are converted like every response.
    expect(validated.log[0]?.date).toBeInstanceOf(Date);
  });

  it("is never retried, even on a 503", async () => {
    const { mt, calls } = testClient(() => json({}, 503), { maxRetries: 3 });
    await expect(mt.deploy(HELLO)).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(1);
  });

  it("uses the client's default namespace, and says so when there is none", async () => {
    const { mt, calls } = testClient(() => json({ isSuccess: true, isDeployed: true, log: [] }));
    await mt.deploy(HELLO);
    expect(calls[0]?.path).toBe("/namespaces/demo/build");
    const { mt: bare } = testClient(() => json({}), { namespace: undefined });
    await expect(bare.deploy(HELLO)).rejects.toThrow(/No namespace/);
  });
});
