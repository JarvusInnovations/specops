// Shared helpers for the plans-* scripts.
//
// Parses YAML frontmatter from plan files using narrow regexes — only the
// fields the plan protocol defines (status, depends, specs, upstream-specs,
// issues, pr). Keeping this dependency-free is a deliberate constraint: the
// scripts must work the moment the skill is checked out, with no `npm install`.

const fs = require('fs');
const path = require('path');

const VALID_STATUSES = ['planned', 'in-progress', 'done', 'blocked', 'cancelled'];

function readFrontmatter(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  return match[1];
}

function parseScalar(block, key) {
  const re = new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm');
  const m = block.match(re);
  if (!m) return null;
  return m[1].replace(/^["']|["']$/g, '');
}

function parseInlineList(block, key) {
  const re = new RegExp(`^${key}:\\s*\\[(.*?)\\]\\s*$`, 'm');
  const m = block.match(re);
  if (!m) return null;
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function parseBlockList(block, key) {
  // YAML block list: `key:` followed by `  - item` lines until a non-indented line.
  const lines = block.split(/\r?\n/);
  const startRe = new RegExp(`^${key}:\\s*$`);
  let i = lines.findIndex((l) => startRe.test(l));
  if (i === -1) return null;
  const items = [];
  for (i += 1; i < lines.length; i += 1) {
    const line = lines[i];
    const m = line.match(/^\s+-\s+(.+?)\s*$/);
    if (!m) break;
    items.push(m[1].replace(/^["']|["']$/g, ''));
  }
  return items;
}

function parseList(block, key) {
  const inline = parseInlineList(block, key);
  if (inline !== null) return inline;
  const blockList = parseBlockList(block, key);
  if (blockList !== null) return blockList;
  return [];
}

function parsePlan(filePath) {
  const fm = readFrontmatter(filePath);
  if (fm === null) return null;
  const slug = path.basename(filePath, '.md');
  const status = parseScalar(fm, 'status') || 'unknown';
  const depends = parseList(fm, 'depends');
  const pr = parseScalar(fm, 'pr');
  return {
    slug,
    file: filePath,
    status,
    depends,
    pr: pr ? Number(pr) : null,
  };
}

// Load every plan in `dir`. Skips README.md and files starting with `_`.
// Returns { plans: Map<slug, plan>, warnings: string[] }.
function loadPlans(dir) {
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) {
    throw new Error(`not a directory: ${dir}`);
  }
  const entries = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.md'))
    .filter((n) => n !== 'README.md')
    .filter((n) => !n.startsWith('_'));

  const plans = new Map();
  const warnings = [];
  for (const name of entries) {
    const full = path.join(dir, name);
    const plan = parsePlan(full);
    if (plan === null) {
      warnings.push(`${name}: no YAML frontmatter, skipping`);
      continue;
    }
    if (!VALID_STATUSES.includes(plan.status)) {
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

  return { plans, warnings };
}

// Kahn topological sort. Returns { order: slug[], cycles: slug[][] }.
// `cycles` lists slugs that couldn't be ordered because they're in a cycle.
function topoSort(plans) {
  const inDegree = new Map();
  const dependents = new Map();
  for (const slug of plans.keys()) {
    inDegree.set(slug, 0);
    dependents.set(slug, []);
  }
  for (const plan of plans.values()) {
    for (const dep of plan.depends) {
      if (!plans.has(dep)) continue;
      inDegree.set(plan.slug, inDegree.get(plan.slug) + 1);
      dependents.get(dep).push(plan.slug);
    }
  }
  const ready = [];
  for (const [slug, deg] of inDegree.entries()) {
    if (deg === 0) ready.push(slug);
  }
  ready.sort();
  const order = [];
  while (ready.length > 0) {
    const slug = ready.shift();
    order.push(slug);
    for (const child of dependents.get(slug)) {
      inDegree.set(child, inDegree.get(child) - 1);
      if (inDegree.get(child) === 0) {
        ready.push(child);
        ready.sort();
      }
    }
  }
  const cycles = [];
  for (const [slug, deg] of inDegree.entries()) {
    if (deg > 0) cycles.push(slug);
  }
  return { order, cycles };
}

// For each plan, the set of (open) downstream plans it transitively unblocks.
// "Open" = not done and not cancelled.
function computeDownstreamCounts(plans) {
  const dependents = new Map();
  for (const slug of plans.keys()) dependents.set(slug, []);
  for (const plan of plans.values()) {
    for (const dep of plan.depends) {
      if (dependents.has(dep)) dependents.get(dep).push(plan.slug);
    }
  }
  const isOpen = (slug) => {
    const p = plans.get(slug);
    return p && p.status !== 'done' && p.status !== 'cancelled';
  };
  const memo = new Map();
  function walk(slug, seen) {
    if (memo.has(slug)) return memo.get(slug);
    if (seen.has(slug)) return new Set();
    seen.add(slug);
    const reachable = new Set();
    for (const child of dependents.get(slug)) {
      if (isOpen(child)) reachable.add(child);
      for (const r of walk(child, seen)) reachable.add(r);
    }
    seen.delete(slug);
    memo.set(slug, reachable);
    return reachable;
  }
  const counts = new Map();
  for (const slug of plans.keys()) {
    counts.set(slug, walk(slug, new Set()).size);
  }
  return counts;
}

module.exports = {
  VALID_STATUSES,
  parsePlan,
  loadPlans,
  topoSort,
  computeDownstreamCounts,
};
