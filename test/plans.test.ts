import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzePlans, classify, loadPlans } from "../src/cli/plans.js";

let dir: string;

const PLANS: Record<string, string> = {
  // done — terminal, carries a PR
  "foundation.md": `---\nstatus: done\ndepends: []\npr: 5\n---\n`,
  // ready: only dep (foundation) is done, no awaits
  "storage.md": `---\nstatus: planned\ndepends: [foundation]\n---\n`,
  // blocked by unfinished dep (storage is planned)
  "api.md": `---\nstatus: planned\ndepends: [storage]\n---\n`,
  // in-progress
  "auth.md": `---\nstatus: in-progress\ndepends: [foundation]\n---\n`,
  // awaiting external — no deps but non-empty awaits
  "billing.md": `---\nstatus: planned\ndepends: []\nawaits:\n  - "vendor X delivery"\n---\n`,
  // status: blocked WITH awaits (documented)
  "mobile.md": `---\nstatus: blocked\nawaits: ["app store approval"]\n---\n`,
  // status: blocked with nothing recorded — should warn
  "legacy.md": `---\nstatus: blocked\ndepends: []\n---\n`,
  // dangling dependency — should warn, classified blocked-by-deps
  "ghost.md": `---\nstatus: planned\ndepends: [doesnotexist]\n---\n`,
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "specops-test-"));
  mkdirSync(join(dir, "plans"), { recursive: true });
  for (const [name, body] of Object.entries(PLANS)) {
    writeFileSync(join(dir, "plans", name), body);
  }
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const plansDir = () => join(dir, "plans");
const slugs = (xs: { plan: { slug: string } }[]) => xs.map((x) => x.plan.slug);

test("classifies plans into the right sections", () => {
  const a = analyzePlans(plansDir());
  expect(slugs(a.ready)).toEqual(["storage"]);
  expect(slugs(a.inProgress)).toEqual(["auth"]);
  expect(slugs(a.awaiting)).toEqual(["billing"]);
  expect(slugs(a.blockedByDeps).sort()).toEqual(["api", "ghost"]);
  expect(slugs(a.blockedByStatus).sort()).toEqual(["legacy", "mobile"]);
  expect(a.done.map((p) => p.slug)).toEqual(["foundation"]);
  expect(a.cancelled).toEqual([]);
});

test("ready plans expose the transitive open-downstream count", () => {
  const a = analyzePlans(plansDir());
  // storage unblocks api (still open)
  expect(a.downstream.get("storage")).toBe(1);
});

test("status: blocked takes precedence over awaiting", () => {
  const { plans } = loadPlans(plansDir());
  // mobile has awaits AND status: blocked → blocked-status, not awaiting
  expect(classify(plans.get("mobile")!, plans).state).toBe("blocked-status");
  // billing has awaits and no blocked status → awaiting
  expect(classify(plans.get("billing")!, plans).state).toBe("awaiting");
});

test("surfaces hygiene warnings (dangling dep + undocumented block)", () => {
  const a = analyzePlans(plansDir());
  expect(a.warnings.some((w) => w.includes("doesnotexist") && w.includes("no plan file"))).toBe(true);
  expect(a.warnings.some((w) => w.startsWith("legacy:") && w.includes("what's blocking it"))).toBe(true);
});

test("open dependencies are rendered with status / no-plan-file annotations", () => {
  const { plans } = loadPlans(plansDir());
  expect(classify(plans.get("api")!, plans).openDeps).toEqual(["storage [planned]"]);
  expect(classify(plans.get("ghost")!, plans).openDeps).toEqual(["doesnotexist (no plan file)"]);
});
