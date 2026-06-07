/**
 * Plan-file parser + DAG walker — the determinism layer over the files-first
 * plans/ workflow. Parses YAML frontmatter with narrow regexes (no YAML lib):
 * only the fields the plan protocol defines (status, depends, awaits, pr).
 *
 * Ported from the original zero-dep scripts/lib/plans.js; behavior is preserved
 * exactly (classification, ordering, warnings) and re-exposed as typed TS so the
 * commands can share one analysis pass.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { basename, join } from "node:path";

export const VALID_STATUSES = [
  "planned",
  "in-progress",
  "done",
  "blocked",
  "cancelled",
] as const;

export interface Plan {
  slug: string;
  file: string;
  status: string;
  depends: string[];
  awaits: string[];
  pr: number | null;
}

function readFrontmatter(filePath: string): string | null {
  const text = readFileSync(filePath, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  return match[1]!;
}

function parseScalar(block: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m");
  const m = block.match(re);
  if (!m) return null;
  return m[1]!.replace(/^["']|["']$/g, "");
}

function parseInlineList(block: string, key: string): string[] | null {
  const re = new RegExp(`^${key}:\\s*\\[(.*?)\\]\\s*$`, "m");
  const m = block.match(re);
  if (!m) return null;
  return m[1]!
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function parseBlockList(block: string, key: string): string[] | null {
  // YAML block list: `key:` followed by `  - item` lines until a non-indented line.
  const lines = block.split(/\r?\n/);
  const startRe = new RegExp(`^${key}:\\s*$`);
  let i = lines.findIndex((l) => startRe.test(l));
  if (i === -1) return null;
  const items: string[] = [];
  for (i += 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    const m = line.match(/^\s+-\s+(.+?)\s*$/);
    if (!m) break;
    items.push(m[1]!.replace(/^["']|["']$/g, ""));
  }
  return items;
}

function parseList(block: string, key: string): string[] {
  const inline = parseInlineList(block, key);
  if (inline !== null) return inline;
  const blockList = parseBlockList(block, key);
  if (blockList !== null) return blockList;
  return [];
}

export function parsePlan(filePath: string): Plan | null {
  const fm = readFrontmatter(filePath);
  if (fm === null) return null;
  const slug = basename(filePath, ".md");
  const status = parseScalar(fm, "status") || "unknown";
  const depends = parseList(fm, "depends");
  const awaits = parseList(fm, "awaits");
  const pr = parseScalar(fm, "pr");
  return {
    slug,
    file: filePath,
    status,
    depends,
    awaits,
    pr: pr ? Number(pr) : null,
  };
}

export interface LoadResult {
  plans: Map<string, Plan>;
  warnings: string[];
}

/**
 * Load every plan in `dir`. Skips README.md and files starting with `_`.
 * Throws if `dir` is not a directory.
 */
export function loadPlans(dir: string): LoadResult {
  const stat = statSync(dir);
  if (!stat.isDirectory()) {
    throw new Error(`not a directory: ${dir}`);
  }
  const entries = readdirSync(dir)
    .filter((n) => n.endsWith(".md"))
    .filter((n) => n !== "README.md")
    .filter((n) => !n.startsWith("_"));

  const plans = new Map<string, Plan>();
  const warnings: string[] = [];
  for (const name of entries) {
    const full = join(dir, name);
    const plan = parsePlan(full);
    if (plan === null) {
      warnings.push(`${name}: no YAML frontmatter, skipping`);
      continue;
    }
    if (!(VALID_STATUSES as readonly string[]).includes(plan.status)) {
      warnings.push(`${plan.slug}: unknown status "${plan.status}"`);
    }
    plans.set(plan.slug, plan);
  }

  // Warn on dangling depends (referenced plan doesn't exist).
  for (const plan of plans.values()) {
    for (const dep of plan.depends) {
      if (!plans.has(dep)) {
        warnings.push(`${plan.slug}: depends on "${dep}" which has no plan file`);
      }
    }
  }

  // Warn on undocumented blocks: status: blocked with no awaits and no
  // unfinished depends leaves the blocker unstated. The plan protocol calls
  // this a smell; surface it so authors fix it.
  for (const plan of plans.values()) {
    if (plan.status !== "blocked") continue;
    if (plan.awaits.length > 0) continue;
    const hasOpenDeps = plan.depends.some((dep) => {
      const d = plans.get(dep);
      return d && d.status !== "done" && d.status !== "cancelled";
    });
    if (!hasOpenDeps) {
      warnings.push(
        `${plan.slug}: status: blocked with no awaits: and no unfinished depends — what's blocking it?`,
      );
    }
  }

  return { plans, warnings };
}

export interface TopoResult {
  order: string[];
  cycles: string[];
}

/**
 * Kahn topological sort. `cycles` lists slugs that couldn't be ordered because
 * they're in a cycle.
 */
export function topoSort(plans: Map<string, Plan>): TopoResult {
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const slug of plans.keys()) {
    inDegree.set(slug, 0);
    dependents.set(slug, []);
  }
  for (const plan of plans.values()) {
    for (const dep of plan.depends) {
      if (!plans.has(dep)) continue;
      inDegree.set(plan.slug, inDegree.get(plan.slug)! + 1);
      dependents.get(dep)!.push(plan.slug);
    }
  }
  const ready: string[] = [];
  for (const [slug, deg] of inDegree.entries()) {
    if (deg === 0) ready.push(slug);
  }
  ready.sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const slug = ready.shift()!;
    order.push(slug);
    for (const child of dependents.get(slug)!) {
      inDegree.set(child, inDegree.get(child)! - 1);
      if (inDegree.get(child) === 0) {
        ready.push(child);
        ready.sort();
      }
    }
  }
  const cycles: string[] = [];
  for (const [slug, deg] of inDegree.entries()) {
    if (deg > 0) cycles.push(slug);
  }
  return { order, cycles };
}

/**
 * For each plan, the count of (open) downstream plans it transitively unblocks.
 * "Open" = not done and not cancelled.
 */
export function computeDownstreamCounts(plans: Map<string, Plan>): Map<string, number> {
  const dependents = new Map<string, string[]>();
  for (const slug of plans.keys()) dependents.set(slug, []);
  for (const plan of plans.values()) {
    for (const dep of plan.depends) {
      if (dependents.has(dep)) dependents.get(dep)!.push(plan.slug);
    }
  }
  const isOpen = (slug: string): boolean => {
    const p = plans.get(slug);
    return !!p && p.status !== "done" && p.status !== "cancelled";
  };
  const memo = new Map<string, Set<string>>();
  function walk(slug: string, seen: Set<string>): Set<string> {
    if (memo.has(slug)) return memo.get(slug)!;
    if (seen.has(slug)) return new Set();
    seen.add(slug);
    const reachable = new Set<string>();
    for (const child of dependents.get(slug)!) {
      if (isOpen(child)) reachable.add(child);
      for (const r of walk(child, seen)) reachable.add(r);
    }
    seen.delete(slug);
    memo.set(slug, reachable);
    return reachable;
  }
  const counts = new Map<string, number>();
  for (const slug of plans.keys()) {
    counts.set(slug, walk(slug, new Set()).size);
  }
  return counts;
}

export type PlanState =
  | "ready"
  | "in-progress"
  | "awaiting"
  | "blocked-by-deps"
  | "blocked-status";

export interface Classified {
  plan: Plan;
  /** Open (unfinished) dependencies, each rendered as `<slug> [<status>]` or `<slug> (no plan file)`. */
  openDeps: string[];
}

/**
 * Classify a plan. `awaiting` takes precedence over `blocked-by-deps` when both
 * apply (a plan with non-empty awaits is never "ready" regardless of dep state).
 */
export function classify(plan: Plan, plans: Map<string, Plan>): { state: PlanState; openDeps: string[] } {
  const openDeps: string[] = [];
  for (const dep of plan.depends) {
    const depPlan = plans.get(dep);
    if (!depPlan) {
      openDeps.push(`${dep} (no plan file)`);
      continue;
    }
    if (depPlan.status !== "done" && depPlan.status !== "cancelled") {
      openDeps.push(`${dep} [${depPlan.status}]`);
    }
  }
  if (plan.status === "in-progress") return { state: "in-progress", openDeps };
  if (plan.status === "blocked") return { state: "blocked-status", openDeps };
  if (plan.awaits.length > 0) return { state: "awaiting", openDeps };
  if (openDeps.length > 0) return { state: "blocked-by-deps", openDeps };
  return { state: "ready", openDeps };
}

export interface Analysis {
  plans: Map<string, Plan>;
  warnings: string[];
  cycles: string[];
  downstream: Map<string, number>;
  ready: Classified[];
  inProgress: Classified[];
  awaiting: Classified[];
  blockedByDeps: Classified[];
  blockedByStatus: Classified[];
  done: Plan[];
  cancelled: Plan[];
}

/** One full analysis pass shared by the `next` and home (dashboard) commands. */
export function analyzePlans(dir: string): Analysis {
  const { plans, warnings } = loadPlans(dir);
  const downstream = computeDownstreamCounts(plans);
  const { order, cycles } = topoSort(plans);
  if (cycles.length > 0) {
    warnings.push(`cycle detected among: ${cycles.join(", ")}`);
  }

  const ready: Classified[] = [];
  const inProgress: Classified[] = [];
  const awaiting: Classified[] = [];
  const blockedByDeps: Classified[] = [];
  const blockedByStatus: Classified[] = [];
  const done: Plan[] = [];
  const cancelled: Plan[] = [];

  const slugs = order.length ? order : [...plans.keys()];
  for (const slug of slugs) {
    const plan = plans.get(slug)!;
    if (plan.status === "done") {
      done.push(plan);
      continue;
    }
    if (plan.status === "cancelled") {
      cancelled.push(plan);
      continue;
    }
    const c = classify(plan, plans);
    const entry: Classified = { plan, openDeps: c.openDeps };
    if (c.state === "ready") ready.push(entry);
    else if (c.state === "in-progress") inProgress.push(entry);
    else if (c.state === "awaiting") awaiting.push(entry);
    else if (c.state === "blocked-status") blockedByStatus.push(entry);
    else blockedByDeps.push(entry);
  }

  // Sort Ready: by downstream count (desc), then alphabetical.
  ready.sort((a, b) => {
    const da = downstream.get(a.plan.slug) || 0;
    const db = downstream.get(b.plan.slug) || 0;
    if (db !== da) return db - da;
    return a.plan.slug.localeCompare(b.plan.slug);
  });

  return {
    plans,
    warnings,
    cycles,
    downstream,
    ready,
    inProgress,
    awaiting,
    blockedByDeps,
    blockedByStatus,
    done,
    cancelled,
  };
}

/** Whether a plans directory exists (for definitive empty states, not errors). */
export function plansDirExists(dir: string): boolean {
  return existsSync(dir) && statSync(dir).isDirectory();
}
