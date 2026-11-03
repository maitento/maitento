// Runs after `tsc` in `npm run build`: bundles the .mtr schema with the extension and writes the snippets from it.
//
//   schema/mtr-schema.json   a copy of ../../sdks/mtr-schema.json (generated from Maitento's code)
//   snippets/mtr.json        one "new file" snippet per kind of .mtr file
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const source = path.resolve(root, "..", "..", "sdks", "mtr-schema.json");
const require = createRequire(import.meta.url);

fs.mkdirSync(path.join(root, "schema"), { recursive: true });
fs.copyFileSync(source, path.join(root, "schema", "mtr-schema.json"));

const { loadSchema } = require(path.join(root, "out", "src", "mtr", "schema.js"));
const { snippetsFile } = require(path.join(root, "out", "src", "mtr", "snippets.js"));
const schema = loadSchema(path.join(root, "schema", "mtr-schema.json"));
fs.mkdirSync(path.join(root, "snippets"), { recursive: true });
fs.writeFileSync(path.join(root, "snippets", "mtr.json"), `${JSON.stringify(snippetsFile(schema), null, 2)}\n`);

console.log(`prepared: schema version ${schema.schemaVersion}, ${schema.kinds.length} kinds, ${schema.kinds.length} snippets.`);
