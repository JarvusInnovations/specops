/**
 * TEMPLATE — replace `mytool` with your CLI name.
 *
 * How to invoke this CLI, as a runnable command prefix. The bundle ships inside
 * a skill and is **not on `PATH`**, so emitted examples (home view, ambient hook
 * output, help[] hints, error suggestions) must use the resolved path — otherwise
 * an agent that reads a bare `mytool` in a hint assumes it's on PATH and the call
 * fails.
 *
 * Prefers the sibling shim (`…/scripts/mytool`) when it's executable, since that
 * matches how SKILL.md documents invocation; falls back to `node <bundle>` which
 * always works. Home dir is collapsed to `~`.
 *
 * (Note: SKILL.md's own examples are hardcoded to the relative `scripts/mytool`
 * form — this helper is only for output the CLI emits at runtime.)
 */
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

let cached: string | undefined;

export function cliInvocation(): string {
  if (cached) return cached;

  let bundle: string;
  try {
    bundle = fileURLToPath(import.meta.url);
  } catch {
    bundle = process.argv[1] ?? "mytool";
  }

  const shim = bundle.replace(/\.mjs$/, "");
  try {
    if (shim !== bundle) {
      accessSync(shim, constants.X_OK);
      cached = quote(collapseHome(shim));
      return cached;
    }
  } catch {
    // shim missing or not executable — fall back to invoking the bundle
  }
  cached = `node ${quote(collapseHome(bundle))}`;
  return cached;
}

function collapseHome(p: string): string {
  const home = homedir();
  return home && p.startsWith(`${home}/`) ? `~${p.slice(home.length)}` : p;
}

function quote(p: string): string {
  return /\s/.test(p) ? `"${p}"` : p;
}
