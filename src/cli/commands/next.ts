import { parseArgs } from "../args.js";
import { analyzePlans, plansDirExists } from "../plans.js";
import { renderObject, renderList, renderLines, renderHelp, renderOutput } from "../toon.js";
import { cliInvocation } from "../invocation.js";
import {
  resolvePlansDir,
  collapseHome,
  summaryLine,
  joinAwaits,
  joinDeps,
} from "./common.js";

export const NEXT_HELP = `usage: specops next [plans-dir] [flags]

Plans ordered by readiness. Sections (each emitted only when non-empty):
  ready             deps all done AND awaits empty — sorted so the plan that
                    unblocks the most downstream work appears first
  in_progress       (only with --include-in-progress) someone's already on it
  awaiting          non-empty awaits: — external blockers called out
  blocked_by_deps   awaits empty but one or more deps still open
  blocked           status: blocked (lifecycle explicitly blocked)
done/cancelled plans are omitted; the summary line carries their counts.

flags:
  --dir <path>             plans directory (default ./plans; also positional)
  --include-in-progress    also list in-progress plans
  --slugs-only             print ready slugs only, one per line (scripting)
  --help

examples:
  specops next
  specops next --include-in-progress
  specops next --slugs-only`;

export async function nextCommand(args: string[]): Promise<string> {
  const parsed = parseArgs(args, ["include-in-progress", "slugs-only"]);
  const dir = resolvePlansDir(parsed);
  const cli = cliInvocation();

  if (!plansDirExists(dir)) {
    return renderOutput([
      renderObject({ plans: `no plans/ directory at ${collapseHome(dir)}` }),
      renderHelp([
        "Start one by adding a plan file under plans/ (see references/plans-protocol.md)",
        `Run \`${cli} --help\` for usage`,
      ]),
    ]);
  }

  const a = analyzePlans(dir);

  if (a.plans.size === 0) {
    return renderOutput([
      renderObject({ plans: `0 plan files in ${collapseHome(dir)} (looked for *.md, excluding README.md and _*.md)` }),
      renderHelp(["Add a plan file under plans/ to begin (see references/plans-protocol.md)"]),
    ]);
  }

  if (parsed.flags["slugs-only"]) {
    return a.ready.map((r) => r.plan.slug).join("\n");
  }

  const unblocks = (slug: string): number => a.downstream.get(slug) || 0;
  const blocks: string[] = [renderObject({ summary: summaryLine(a) })];

  if (a.ready.length) {
    blocks.push(
      renderList(
        "ready",
        a.ready.map((r) => ({ slug: r.plan.slug, unblocks: unblocks(r.plan.slug) })),
      ),
    );
  }

  if (parsed.flags["include-in-progress"] && a.inProgress.length) {
    blocks.push(
      renderList(
        "in_progress",
        a.inProgress.map((r) => ({
          slug: r.plan.slug,
          unblocks: unblocks(r.plan.slug),
          awaits: r.plan.awaits.length ? joinAwaits(r) : "none",
        })),
      ),
    );
  }

  if (a.awaiting.length) {
    blocks.push(
      renderList(
        "awaiting",
        a.awaiting.map((r) => ({ slug: r.plan.slug, awaits: joinAwaits(r), deps: joinDeps(r) })),
      ),
    );
  }

  if (a.blockedByDeps.length) {
    blocks.push(
      renderList(
        "blocked_by_deps",
        a.blockedByDeps.map((r) => ({ slug: r.plan.slug, deps: joinDeps(r) })),
      ),
    );
  }

  if (a.blockedByStatus.length) {
    blocks.push(
      renderList(
        "blocked",
        a.blockedByStatus.map((r) => ({
          slug: r.plan.slug,
          awaits: r.plan.awaits.length ? joinAwaits(r) : "none",
          deps: joinDeps(r),
        })),
      ),
    );
  }

  if (a.warnings.length) {
    blocks.push(renderLines("warnings", a.warnings));
  }

  const help: string[] = [];
  if (a.ready.length) {
    help.push("Read the top ready plan's file, then mark it in-progress to start");
  }
  if (!parsed.flags["include-in-progress"] && a.inProgress.length) {
    help.push(`Run \`${cli} next --include-in-progress\` to also see in-flight plans`);
  }
  help.push(`Run \`${cli} dag --fence\` to visualize the dependency graph`);
  blocks.push(renderHelp(help));

  return renderOutput(blocks);
}
