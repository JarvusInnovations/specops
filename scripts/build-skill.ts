/**
 * Splice the generated regions (currently just the command reference) into the
 * hand-authored SKILL.md at the repo root. The methodology prose outside the
 * markers is never touched.
 *
 *   bun scripts/build-skill.ts            # rewrite SKILL.md
 *   bun scripts/build-skill.ts --check    # fail if SKILL.md is stale
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spliceGeneratedRegions } from "../src/cli/skill.js";

const PATH = new URL("../SKILL.md", import.meta.url);
const check = process.argv.includes("--check");

const src = readFileSync(PATH, "utf8");
const out = spliceGeneratedRegions(src);

if (check) {
  if (src !== out) {
    console.error("SKILL.md is out of date — run `bun run build:skill` and commit the result");
    process.exit(1);
  }
  console.log("SKILL.md is up to date");
} else if (src !== out) {
  writeFileSync(PATH, out);
  console.log("Updated SKILL.md generated regions");
} else {
  console.log("SKILL.md already up to date");
}
