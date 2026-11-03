// Writes route-map.json (for the docs generator) from the built src/route-map.ts. Run `npm run route-map`, which
// builds first.
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const built = join(root, "dist", "esm", "route-map.js");
if (!existsSync(built)) {
  console.error("Build first: npm run build");
  process.exit(1);
}
const { routeMapJson } = await import(pathToFileURL(built).href);
writeFileSync(join(root, "route-map.json"), routeMapJson());
console.log("wrote route-map.json");
