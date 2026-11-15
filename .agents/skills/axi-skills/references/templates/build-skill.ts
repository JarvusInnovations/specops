/**
 * TEMPLATE — splice the generated regions (e.g. the command reference) into the
 * hand-authored SKILL.md. The prose outside the markers is never touched.
 *
 *   bun scripts/build-skill.ts            # rewrite SKILL.md
 *   bun scripts/build-skill.ts --check    # fail if SKILL.md is stale
 *
 * Single-skill form shown. For a multi-skill repo, see the MULTI-SKILL block at
 * the bottom — swap the body for a TARGETS array of { path, splice } pairs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spliceGeneratedRegions } from "../src/cli/skill.js";

const PATH = new URL("../skills/mytool/SKILL.md", import.meta.url);
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

/* ── MULTI-SKILL FORM ─────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from "node:fs";
import { spliceSessions } from "../packages/sessions/src/axi/skill.ts";
import { spliceGmail, spliceGoogle } from "../packages/google/src/axi/skill.ts";

interface SkillTarget { path: string; splice: (doc: string) => string; }
const TARGETS: SkillTarget[] = [
  { path: "skills/assist-sessions/SKILL.md",     splice: spliceSessions },
  { path: "skills/assist-gmail/SKILL.md",        splice: spliceGmail },
  { path: "skills/assist-google-setup/SKILL.md", splice: spliceGoogle },
];

const check = process.argv.includes("--check");
let stale = false;
for (const { path, splice } of TARGETS) {
  const src = readFileSync(path, "utf8");
  const out = splice(src);
  if (check) {
    if (src !== out) { console.error(`${path} is out of date — run \`bun run build:skill\``); stale = true; }
    else console.log(`${path} is up to date`);
  } else if (src !== out) { writeFileSync(path, out); console.log(`Updated ${path}`); }
  else console.log(`${path} already up to date`);
}
if (stale) process.exit(1);
──────────────────────────────────────────────────────────────────────────── */
