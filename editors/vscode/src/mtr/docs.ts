/**
 * Links into the project-file reference on docs.maitento.com (generated from the same schema). The test suite checks
 * every page and anchor here against the committed pages in `docs/reference/project-files/`.
 */
export const DOCS_BASE = "https://docs.maitento.com/reference/project-files/";

/** Kind id → the reference page's file name. */
export const KIND_PAGES: Record<string, string> = {
  agent: "agents.md",
  "interaction-one-shot": "interactions-one-shot.md",
  "interaction-round-robin": "interactions-round-robin.md",
  "interaction-managed": "interactions-managed.md",
  connector: "connectors.md",
  tool: "tools.md",
  capsule: "capsules.md",
  loom: "looms.md",
  app: "apps.md",
};

/** GitHub's heading slugs, which the docs site uses too. */
export function slug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

/** The URL of a kind's page, at the section for the top-level property a path starts with. */
export function docsUrl(kindId: string, propertyPath?: string): string | undefined {
  const page = KIND_PAGES[kindId];
  if (!page) return undefined;
  const url = `${DOCS_BASE}${page.replace(/\.md$/, "")}/`;
  if (!propertyPath) return url;
  const topLevel = propertyPath.split(/\[\]|\//)[0]!;
  return `${url}#${slug(`\`${topLevel}\``)}`;
}
