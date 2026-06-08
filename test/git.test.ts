import { test, expect, beforeAll, afterAll } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recentlyDone } from "../src/cli/git.js";

let repo: string;
let plansDir: string;

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "T",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "T",
  GIT_COMMITTER_EMAIL: "t@example.com",
};

function writePlan(slug: string, status: string): void {
  writeFileSync(join(plansDir, `${slug}.md`), `---\nstatus: ${status}\npr: 1\n---\n# ${slug}\n`);
}

function commit(dateISO: string, msg: string): void {
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["commit", "-q", "-m", msg], {
    cwd: repo,
    env: { ...ENV, GIT_AUTHOR_DATE: dateISO, GIT_COMMITTER_DATE: dateISO },
  });
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "specops-git-"));
  plansDir = join(repo, "plans");
  mkdirSync(plansDir);
  execFileSync("git", ["init", "-q"], { cwd: repo });

  // t1: everything planned
  for (const s of ["alpha", "beta", "gamma", "epsilon", "zeta"]) writePlan(s, "planned");
  commit("2026-01-01T00:00:00", "seed plans");

  writePlan("alpha", "done");
  commit("2026-02-01T00:00:00", "alpha done");

  writePlan("beta", "done");
  commit("2026-03-01T00:00:00", "beta done");

  writePlan("gamma", "done");
  writePlan("epsilon", "done");
  commit("2026-04-01T00:00:00", "gamma + epsilon done");

  // epsilon cycles back open, then done again later (should use the NEWEST done)
  writePlan("epsilon", "planned");
  commit("2026-05-01T00:00:00", "reopen epsilon");
  writePlan("epsilon", "done");
  commit("2026-06-01T00:00:00", "epsilon done again");
  // zeta never becomes done
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

const currentlyDone = ["alpha", "beta", "gamma", "epsilon"];

test("returns currently-done plans newest-completed-first, limited", () => {
  const r = recentlyDone(plansDir, currentlyDone, 3);
  expect(r.map((e) => e.slug)).toEqual(["epsilon", "gamma", "beta"]);
  expect(r.map((e) => e.date)).toEqual(["2026-06-01", "2026-04-01", "2026-03-01"]);
});

test("a re-done plan uses its NEWEST completion date, not the first", () => {
  const r = recentlyDone(plansDir, currentlyDone, 10);
  const epsilon = r.find((e) => e.slug === "epsilon");
  expect(epsilon?.date).toBe("2026-06-01"); // not 2026-04-01
});

test("limit larger than the set returns all, oldest last", () => {
  const r = recentlyDone(plansDir, currentlyDone, 10);
  expect(r.map((e) => e.slug)).toEqual(["epsilon", "gamma", "beta", "alpha"]);
});

test("never-done slugs never appear (even if passed)", () => {
  const r = recentlyDone(plansDir, ["zeta"], 5);
  expect(r).toEqual([]);
});

test("not a git repo → [] (never throws)", () => {
  const tmp = mkdtempSync(join(tmpdir(), "specops-nogit-"));
  try {
    expect(recentlyDone(tmp, ["alpha"], 3)).toEqual([]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
