import { resolve } from "node:path";
import { homedir } from "node:os";
import type { ParsedArgs } from "../args.js";
import { plansDirArg } from "../args.js";
import type { Analysis, Classified } from "../plans.js";

/** Absolute plans directory from --dir / positional / default ./plans. */
export function resolvePlansDir(parsed: ParsedArgs): string {
  return resolve(plansDirArg(parsed));
}

/** Collapse $HOME → ~ for readable paths in output. */
export function collapseHome(p: string): string {
  const home = homedir();
  return home && p.startsWith(`${home}/`) ? `~${p.slice(home.length)}` : p;
}

/** The one-line tally shared by `next` and the home dashboard. */
export function summaryLine(a: Analysis): string {
  return (
    `${a.ready.length} ready · ${a.inProgress.length} in-progress · ` +
    `${a.awaiting.length} awaiting · ${a.blockedByDeps.length} blocked-by-deps · ` +
    `${a.blockedByStatus.length} blocked · ${a.done.length} done · ${a.cancelled.length} cancelled`
  );
}

export function joinAwaits(c: Classified): string {
  return c.plan.awaits.join("; ");
}

export function joinDeps(c: Classified): string {
  return c.openDeps.length ? c.openDeps.join("; ") : "none";
}
