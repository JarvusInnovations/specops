import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

/**
 * How to invoke this CLI, as a runnable command prefix. The bundle ships inside
 * a skill and is **not on `PATH`**, so emitted examples (home view, ambient hook
 * output) must use the resolved path — otherwise an agent that reads a bare
 * `specops` in a hint assumes it's on PATH and the call fails.
 *
 * Prefers the sibling shim (`…/scripts/specops`) when it's executable, since
 * that matches how SKILL.md documents invocation; falls back to `node <bundle>`
 * which always works. Home dir is collapsed to `~`.
 */
let cached: string | undefined;

export function cliInvocation(): string {
  if (cached) return cached;

  let bundle: string;
  try {
    bundle = fileURLToPath(import.meta.url);
  } catch {
    bundle = process.argv[1] ?? "specops";
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
