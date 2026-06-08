import { parseArgs } from "../args.js";
import { analyzePlans, plansDirExists, type Classified } from "../plans.js";
import { renderObject, renderList, renderLines, renderHelp, renderOutput } from "../toon.js";
import { cliInvocation } from "../invocation.js";
import { resolvePlansDir, collapseHome, summaryLine } from "./common.js";
import { recentlyDone } from "../git.js";

/** How many recently-completed plans to surface in the dashboard. */
const RECENT_DONE_LIMIT = 3;

/**
 * Home view (no-args) — the plans dashboard for the current repo. Cheap (local
 * file reads only), so it doubles as the SessionStart hook payload: every agent
 * session opens already knowing what's ready and what's blocked. The SDK
 * prepends the `bin:`/`description:` identity header.
 */
export async function homeCommand(args: string[]): Promise<string> {
  const parsed = parseArgs(args, []);
  const dir = resolvePlansDir(parsed);
  const cli = cliInvocation();

  if (!plansDirExists(dir)) {
    return renderOutput([
      renderObject({ plans: `no plans/ directory in ${collapseHome(dir)}` }),
      renderHelp([
        "This repo has no plans/ yet — add one to track work-in-flight (see references/plans-protocol.md)",
        `Run \`${cli} --help\` for usage`,
      ]),
    ]);
  }

  const a = analyzePlans(dir);
  if (a.plans.size === 0) {
    return renderOutput([
      renderObject({ plans: `0 plan files in ${collapseHome(dir)}` }),
      renderHelp([
        "Add a plan file under plans/ to begin (see references/plans-protocol.md)",
        `Run \`${cli} --help\` for usage`,
      ]),
    ]);
  }

  const blocks: string[] = [renderObject({ summary: summaryLine(a) })];

  // What's actively mid-flight — the most relevant "state right now" for a
  // session dashboard. (`next` hides these by default since it answers "what to
  // start"; home is a state overview, so it shows them.)
  if (a.inProgress.length) {
    blocks.push(
      renderList(
        "in_progress",
        a.inProgress.map((r) => ({ slug: r.plan.slug, unblocks: a.downstream.get(r.plan.slug) || 0 })),
      ),
    );
  }

  if (a.ready.length) {
    blocks.push(
      renderList(
        "ready",
        a.ready.map((r) => ({ slug: r.plan.slug, unblocks: a.downstream.get(r.plan.slug) || 0 })),
      ),
    );
  }

  // Compact blocked view: awaiting + blocked-by-deps + status:blocked, one
  // reason each. The full breakdown lives in `next`.
  const blocked = [...a.awaiting, ...a.blockedByDeps, ...a.blockedByStatus];
  if (blocked.length) {
    blocks.push(
      renderList(
        "blocked",
        blocked.map((c) => ({ slug: c.plan.slug, why: whyBlocked(c) })),
      ),
    );
  }

  // Backward-looking momentum: the last few plans to land, by completion date
  // (derived from git history, not commit messages). Best-effort — omitted when
  // not a git repo or nothing is done.
  const recent = recentlyDone(
    dir,
    a.done.map((p) => p.slug),
    RECENT_DONE_LIMIT,
  );
  if (recent.length) {
    const prBySlug = new Map(a.done.map((p) => [p.slug, p.pr]));
    blocks.push(
      renderList(
        "recently_done",
        recent.map((r) => ({ slug: r.slug, done: r.date, pr: prBySlug.get(r.slug) ?? null })),
      ),
    );
  }

  if (a.warnings.length) {
    blocks.push(renderLines("warnings", a.warnings));
  }

  blocks.push(
    renderHelp([
      `Run \`${cli} next\` for the full readiness breakdown`,
      `Run \`${cli} dag --fence\` to visualize the dependency graph`,
    ]),
  );

  return renderOutput(blocks);
}

function whyBlocked(c: Classified): string {
  const more = (rest: number) => (rest > 0 ? ` (+${rest} more)` : "");
  if (c.plan.awaits.length) {
    return `awaits: ${c.plan.awaits[0]}${more(c.plan.awaits.length - 1)}`;
  }
  if (c.openDeps.length) {
    return `needs: ${c.openDeps[0]}${more(c.openDeps.length - 1)}`;
  }
  return `status: ${c.plan.status}`;
}
