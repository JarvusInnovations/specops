import { execFileSync } from "node:child_process";

/**
 * Recency of plan completions, derived from git history — not commit messages.
 *
 * The caller passes the slugs of plans that are **currently** `done` (from the
 * parsed frontmatter). Restricting to those is what makes this both correct and
 * cheap: a plan that cycled `done → open` isn't in the set, so it can't show up;
 * and for any plan that *is* currently done, its newest status-changing commit
 * must be the one that set it to done (a later commit moving it off done would
 * mean it isn't currently done). We confirm "became done" (vs "left done") by
 * reading the `+` side of the diff, which the pickaxe alone can't distinguish.
 *
 * One `git log` scoped to just those files, filtered to status-changing commits
 * (`-G status:`) with zero-context patches (`-U0`), newest-first. We record the
 * first `+status: done` seen per slug and stop once we have `limit` of them.
 *
 * Best-effort: any failure (not a git repo, git missing, shallow clone, no
 * matches) yields `[]` so the home view / SessionStart hook never breaks.
 */
export interface DoneEntry {
  slug: string;
  /** Committer date of the commit that set it done, `YYYY-MM-DD`. */
  date: string;
  commit: string;
}

const UNIT = "\x1f"; // record separator prefixing each commit's --format line

export function recentlyDone(plansDir: string, doneSlugs: string[], limit: number): DoneEntry[] {
  if (doneSlugs.length === 0 || limit <= 0) return [];

  let out: string;
  try {
    out = execFileSync(
      "git",
      [
        "log",
        "-p",
        "-U0",
        "--no-color",
        "-G",
        "status:",
        `--format=${UNIT}%H %cs`,
        "--",
        ...doneSlugs.map((s) => `${s}.md`),
      ],
      {
        cwd: plansDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 32 * 1024 * 1024,
      },
    );
  } catch {
    return [];
  }

  const wanted = new Set(doneSlugs);
  const seen = new Set<string>();
  const results: DoneEntry[] = [];

  let commit = "";
  let date = "";
  let file: string | undefined;

  for (const line of out.split("\n")) {
    if (line.startsWith(UNIT)) {
      const sp = line.indexOf(" ");
      commit = line.slice(1, sp);
      date = line.slice(sp + 1).trim();
      file = undefined;
      continue;
    }
    if (line.startsWith("+++ ")) {
      const m = line.match(/([^/\s]+)\.md/);
      file = m ? m[1] : undefined;
      continue;
    }
    if (line.startsWith("--- ")) continue;
    if (
      file &&
      !seen.has(file) &&
      wanted.has(file) &&
      /^\+status:\s*done\b/.test(line)
    ) {
      seen.add(file);
      results.push({ slug: file, date, commit });
      if (results.length >= limit) break;
    }
  }

  return results;
}
