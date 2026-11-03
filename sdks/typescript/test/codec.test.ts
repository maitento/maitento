import { describe, expect, it } from "vitest";
import { parseDotNetTimeSpan, toDotNetTimeSpan } from "../src/index.js";
import { decode, encode } from "../src/core/codec.js";
import { buildQuery } from "../src/core/http.js";
import { interactionRun, json, testClient, text } from "./helpers.js";

describe("TimeSpan", () => {
  it("formats milliseconds exactly as .NET writes a TimeSpan, never ISO", () => {
    expect(toDotNetTimeSpan(300_000)).toBe("00:05:00");
    expect(toDotNetTimeSpan(1500)).toBe("00:00:01.5000000");
    expect(toDotNetTimeSpan(93_784_500)).toBe("1.02:03:04.5000000");
    expect(toDotNetTimeSpan(-60_000)).toBe("-00:01:00");
    expect(toDotNetTimeSpan(0)).toBe("00:00:00");
  });

  it("parses a .NET TimeSpan to milliseconds", () => {
    expect(parseDotNetTimeSpan("00:05:00")).toBe(300_000);
    expect(parseDotNetTimeSpan("1.02:03:04.5")).toBe(93_784_500);
    expect(parseDotNetTimeSpan("00:00:00.0001234")).toBeCloseTo(0.1234);
    expect(() => parseDotNetTimeSpan("PT5M")).toThrow(RangeError);
  });

  it("decodes response TimeSpans to ms and encodes request ms to TimeSpans", () => {
    const run = decode("InteractionProcess", interactionRun({ executionTime: "00:01:02.5000000" })) as {
      executionTime: number;
    };
    expect(run.executionTime).toBe(62_500);
    const body = encode("InteractionProcessStartRequest", {
      inputs: [],
      durationAutoTerminationOverride: 300_000,
      durationWarningOverride: "00:04:00",
    }) as Record<string, unknown>;
    expect(body.durationAutoTerminationOverride).toBe("00:05:00");
    // A TimeSpan string the caller already wrote passes through.
    expect(body.durationWarningOverride).toBe("00:04:00");
  });

  it("converts TimeSpans nested in arrays and nested models", () => {
    const capsule = decode("CapsuleProcess", {
      id: "c1",
      status: "Running",
      commands: [{ id: "x", maximumDuration: "00:00:30", dateQueued: "2026-10-26T10:00:00Z" }],
      dateCreated: "2026-10-26T10:00:00Z",
      dateUpdated: "2026-10-26T10:00:00Z",
    }) as { commands: Array<{ maximumDuration: number; dateQueued: Date }> };
    expect(capsule.commands[0]?.maximumDuration).toBe(30_000);
    expect(capsule.commands[0]?.dateQueued).toBeInstanceOf(Date);
  });
});

describe("dates", () => {
  it("parses ISO-8601 with 7 fractional digits to a Date (to the millisecond)", () => {
    const run = decode("InteractionProcess", interactionRun()) as { dateCreated: Date; dateStarted: Date | null };
    expect(run.dateCreated).toBeInstanceOf(Date);
    expect(run.dateCreated.toISOString()).toBe("2026-10-26T10:00:00.123Z");
    expect(run.dateStarted).toBeNull();
  });

  it("reads a date the server wrote without an offset as UTC", () => {
    const run = decode("InteractionProcess", interactionRun({ dateUpdated: "2026-10-26T10:00:00" })) as { dateUpdated: Date };
    expect(run.dateUpdated.toISOString()).toBe("2026-10-26T10:00:00.000Z");
  });

  it("leaves a value it cannot read untouched instead of failing the response", () => {
    const run = decode("InteractionProcess", interactionRun({ dateUpdated: "yesterday", executionTime: "PT5M" })) as {
      dateUpdated: unknown;
      executionTime: unknown;
    };
    expect(run.dateUpdated).toBe("yesterday");
    expect(run.executionTime).toBe("PT5M");
  });

  it("sends a Date in a request as ISO-8601", () => {
    const body = encode("UserApiKeyCreateRequest", { name: "ci", dateExpires: new Date("2027-01-01T00:00:00Z") });
    expect(body).toEqual({ name: "ci", dateExpires: "2027-01-01T00:00:00.000Z" });
    expect(buildQuery({ since: new Date("2026-10-25T00:00:00Z"), kind: ["Fact", "Rule"], open: true, skip: undefined })).toBe(
      "?since=2026-10-25T00%3A00%3A00.000Z&kind=Fact&kind=Rule&open=true",
    );
  });
});

describe("polymorphism", () => {
  it("writes the discriminator FIRST, wherever the caller put it", () => {
    const body = encode("CodePipelineProcessCredentialsInput[]", [
      { engine: "Codex", apiKey: "sk-test", isOwnLicense: true, type: "apiKey" },
    ]) as Array<Record<string, unknown>>;
    expect(Object.keys(body[0] ?? {})[0]).toBe("type");
    expect(JSON.stringify(body)).toBe('[{"type":"apiKey","engine":"Codex","apiKey":"sk-test","isOwnLicense":true}]');
  });

  it("adds a concrete type's discriminator when the caller left it out", () => {
    const action = encode("CreateAutomatedActionRequest", {
      name: "digest",
      actions: [{ config: { $type: "interaction", inputs: [], durationAutoTerminationOverride: 60_000, version: null } }],
    }) as { actions: Array<{ config: Record<string, unknown> }> };
    const config = action.actions[0]?.config ?? {};
    expect(Object.keys(config)[0]).toBe("$type");
    expect(config.durationAutoTerminationOverride).toBe("00:01:00");

    const repo = encode("CodePipelineGitSshRepoInput", { name: "app", gitAddress: "git@x:y.git" }) as Record<string, unknown>;
    expect(Object.keys(repo)).toEqual(["type", "name", "gitAddress"]);
    expect(repo.type).toBe("ssh");
  });

  it("decodes a union through the member its discriminator names", () => {
    const items = decode("Interaction[]", [
      {
        $type: "one-shot",
        id: "i1",
        name: "hello",
        versions: [{ version: 1, date: "2026-10-26T10:00:00Z", durationAutoTermination: "00:10:00" }],
        dateCreated: "2026-10-26T10:00:00Z",
        dateUpdated: "2026-10-26T10:00:00Z",
      },
      { $type: "from-a-newer-server", dateCreated: "2026-10-26T10:00:00Z" },
    ]) as Array<{ versions?: Array<{ date: Date; durationAutoTermination: number }>; dateCreated: unknown }>;
    expect(items[0]?.versions?.[0]?.date).toBeInstanceOf(Date);
    expect(items[0]?.versions?.[0]?.durationAutoTermination).toBe(600_000);
    // An unknown member is kept as it came.
    expect(items[1]?.dateCreated).toBe("2026-10-26T10:00:00Z");
  });
});

describe("tolerance and immutability", () => {
  it("keeps unknown fields and unknown enum values", () => {
    const run = decode("InteractionProcess", interactionRun({ status: "SomethingNew", brandNewField: { a: 1 } })) as Record<
      string,
      unknown
    >;
    expect(run.status).toBe("SomethingNew");
    expect(run.brandNewField).toEqual({ a: 1 });
  });

  it("never changes the caller's request object", () => {
    const request = { inputs: [], durationAutoTerminationOverride: 1000 };
    const frozen = JSON.stringify(request);
    encode("InteractionProcessStartRequest", request);
    expect(JSON.stringify(request)).toBe(frozen);
  });

  it("converts maps of models", () => {
    const value = decode("map<string, Agent>", {
      a: { name: "a", versions: [], dateCreated: "2026-10-26T10:00:00Z", dateUpdated: "2026-10-26T10:00:00Z" },
    }) as Record<string, { dateCreated: Date }>;
    expect(value.a?.dateCreated).toBeInstanceOf(Date);
  });
});

describe("through the client", () => {
  it("start: ms in, TimeSpan on the wire; the run comes back with Dates and ms", async () => {
    const { mt, calls } = testClient(() => json(interactionRun({ executionTime: "00:00:02" })));
    const run = await mt.interactions.start("hello", {
      inputs: { message: "Hi", days: 3, polite: true, skipped: undefined },
      durationAutoTerminationOverride: 120_000,
    });
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.path).toBe("/namespaces/demo/interactions/by-name/hello/start");
    expect(calls[0]?.body).toEqual({
      inputs: [
        { name: "message", value: "Hi" },
        { name: "days", value: "3" },
        { name: "polite", value: "true" },
      ],
      durationAutoTerminationOverride: "00:02:00",
    });
    expect(run.executionTime).toBe(2000);
    expect(run.dateCreated).toBeInstanceOf(Date);
  });
});

describe("plain-text bodies are decided by Content-Type", () => {
  it("a VFS text sent as text/plain is returned exactly, even when it starts with a quote", async () => {
    const { mt, calls } = testClient(() => text('"quoted" value'));
    await expect(mt.vfs.open("notes").readText("/quoted.txt")).resolves.toBe('"quoted" value');
    expect(calls[0]?.headers.get("accept")).toBe("text/plain");
    expect(calls[0]?.path).toBe("/namespaces/demo/vfs/by-name/notes/files/contents/text");
  });

  it("secrets are write-only: the SDK has no call that reads a value back", () => {
    const { mt } = testClient(() => text("unused"));
    expect("value" in mt.secrets).toBe(false);
  });

  it("a VFS text answered as a JSON string is unquoted", async () => {
    const { mt, calls } = testClient(() => json("# Today\n"));
    await expect(mt.vfs.open("notes").readText("/today.md")).resolves.toBe("# Today\n");
    expect(calls[0]?.url.search).toBe("?path=%2Ftoday.md");
  });

  it("VFS bytes come back as a Uint8Array", async () => {
    const { mt } = testClient(
      () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "application/octet-stream" } }),
    );
    await expect(mt.vfs.open("notes").readBytes("/a.bin")).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it("a file download carries its content type and file name", async () => {
    const { mt } = testClient(
      () =>
        new Response(new Uint8Array([37, 80, 68, 70]), {
          status: 200,
          headers: { "content-type": "application/pdf", "content-disposition": "attachment; filename=\"hand book.pdf\"" },
        }),
    );
    const file = await mt.files.download("f1");
    expect(file).toEqual({ bytes: new Uint8Array([37, 80, 68, 70]), contentType: "application/pdf", fileName: "hand book.pdf" });
  });

  it("JSON booleans and string arrays pass through", async () => {
    const { mt } = testClient((req) => (req.path.endsWith("/exists") ? json(true) : json(["a", "b"])));
    await expect(mt.vfs.open("notes").exists("/a.md")).resolves.toBe(true);
    await expect(mt.vfs.open("notes").readLines("/a.md")).resolves.toEqual(["a", "b"]);
  });
});
