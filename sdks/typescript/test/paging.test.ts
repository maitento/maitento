import { describe, expect, it } from "vitest";
import { Page } from "../src/index.js";
import { json, testClient } from "./helpers.js";

function summary(id: string): Record<string, unknown> {
  return { id, type: "Interaction", status: "Finished", state: "Terminal", dateCreated: "2026-10-26T10:00:00Z", dateUpdated: "2026-10-26T10:00:01Z" };
}

const PAGES: Record<string, { items: unknown[]; nextCursor: string | null }> = {
  "": { items: [summary("r1"), summary("r2")], nextCursor: "c2" },
  c2: { items: [summary("r3")], nextCursor: "c3" },
  c3: { items: [summary("r4")], nextCursor: null },
};

function pagedClient(): ReturnType<typeof testClient> {
  return testClient((req) => json(PAGES[req.url.searchParams.get("cursor") ?? ""] ?? { items: [], nextCursor: null }));
}

describe("cursor paging", () => {
  it("await → the first page, with items and nextCursor", async () => {
    const { mt, calls } = pagedClient();
    const page = await mt.runs.list({ limit: 2 });
    expect(page).toBeInstanceOf(Page);
    expect(page.items.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(page.items[0]?.dateCreated).toBeInstanceOf(Date);
    expect(page.nextCursor).toBe("c2");
    expect(page.hasNextPage()).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.searchParams.get("limit")).toBe("2");
    const second = await page.nextPage();
    expect(second?.items.map((r) => r.id)).toEqual(["r3"]);
    expect(calls[1]?.url.searchParams.get("cursor")).toBe("c2");
  });

  it("for await over the call walks every item of every page, fetching pages as it goes", async () => {
    const { mt, calls } = pagedClient();
    const ids: string[] = [];
    for await (const run of mt.runs.list({ limit: 2 })) {
      ids.push(run.id);
    }
    expect(ids).toEqual(["r1", "r2", "r3", "r4"]);
    expect(calls.map((c) => c.url.searchParams.get("cursor"))).toEqual([null, "c2", "c3"]);
    // Every page keeps the filters.
    expect(calls.every((c) => c.url.searchParams.get("limit") === "2")).toBe(true);
  });

  it("for await over an awaited page walks from that page on", async () => {
    const { mt } = pagedClient();
    const page = await mt.runs.list();
    const second = await page.nextPage();
    const ids: string[] = [];
    for await (const run of second!) ids.push(run.id);
    expect(ids).toEqual(["r3", "r4"]);
  });

  it("stopping early fetches no more pages, and an unused call fetches nothing", async () => {
    const { mt, calls } = pagedClient();
    mt.runs.list();
    expect(calls).toHaveLength(0);
    for await (const run of mt.runs.list()) {
      if (run.id === "r1") break;
    }
    expect(calls).toHaveLength(1);
  });

  it("runs.list sends ids/types/statuses as CSV and repeats namespace", async () => {
    const { mt, calls } = pagedClient();
    await mt.runs.list({
      ids: ["a", "b"],
      types: ["Interaction", "App"],
      statuses: ["Running", "Finished"],
      namespace: ["demo", "support"],
      state: "Active",
      retained: false,
      createdAfter: new Date("2026-10-01T00:00:00Z"),
    });
    const params = calls[0]?.url.searchParams;
    expect(params?.get("ids")).toBe("a,b");
    expect(params?.get("types")).toBe("Interaction,App");
    expect(params?.get("statuses")).toBe("Running,Finished");
    expect(params?.getAll("namespace")).toEqual(["demo", "support"]);
    expect(params?.get("state")).toBe("Active");
    expect(params?.get("retained")).toBe("false");
    expect(params?.get("createdAfter")).toBe("2026-10-01T00:00:00.000Z");
  });

  it("builds.list pages /builds (namespaces as a filter) or /namespaces/{ns}/builds", async () => {
    const { mt, calls } = testClient(() => json({ items: [], nextCursor: null }));
    await mt.builds.list({ namespaces: ["a", "b"], outcome: "Failed" });
    await mt.builds.list({ namespace: "demo", isDeploy: true });
    expect(calls[0]?.path).toBe("/builds");
    expect(calls[0]?.url.searchParams.getAll("namespace")).toEqual(["a", "b"]);
    expect(calls[0]?.url.searchParams.get("outcome")).toBe("Failed");
    expect(calls[1]?.path).toBe("/namespaces/demo/builds");
    expect(calls[1]?.url.searchParams.get("isDeploy")).toBe("true");
  });

  it("partitions.files pages a partition's files", async () => {
    const { mt, calls } = testClient((req) =>
      json(
        req.url.searchParams.get("cursor")
          ? { items: [{ id: "f2", dateCreated: "2026-10-26T10:00:00Z" }], nextCursor: null }
          : { items: [{ id: "f1", dateCreated: "2026-10-26T10:00:00Z" }], nextCursor: "n" },
      ),
    );
    const names: string[] = [];
    for await (const file of mt.partitions.files("p1", { limit: 1 })) names.push(file.id);
    expect(names).toEqual(["f1", "f2"]);
    expect(calls[0]?.path).toBe("/partitions/by-id/p1/files");
  });
});
