import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hookCommand_ } from "../src/cli/commands/hook.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "specops-hook-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function installedCommand(): string {
  const settings = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8"));
  return settings.hooks.SessionStart[0].hooks[0].command;
}

test("project hook is portable: CLAUDE_PROJECT_DIR-relative, no absolute machine path", async () => {
  await hookCommand_(["install", "--dir", dir]);
  const command = installedCommand();

  // Must resolve against the project dir at runtime, not a baked-in absolute path,
  // so the committed hook works on every machine and for every contributor.
  expect(command).toBe('"${CLAUDE_PROJECT_DIR}/.claude/skills/specops/scripts/specops"');
  // Guard against regressing to the machine-specific `node "<abs path>"` form.
  expect(command).not.toContain(dir);
  expect(command).not.toMatch(/\/Users\/|\/home\/|\.agents\//);
});

test("reinstall over a stale absolute-path hook replaces it in place", async () => {
  // Simulate the old broken hook: an absolute path containing the "specops" marker.
  const stale = {
    hooks: {
      SessionStart: [
        {
          matcher: "",
          hooks: [
            { type: "command", command: `node "${dir}/.agents/skills/specops/scripts/specops.mjs"`, timeout: 10 },
          ],
        },
      ],
    },
  };
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "settings.json"), `${JSON.stringify(stale, null, 2)}\n`);

  await hookCommand_(["install", "--dir", dir]);

  const settings = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8"));
  // Still exactly one SessionStart hook — replaced, not appended.
  expect(settings.hooks.SessionStart).toHaveLength(1);
  expect(settings.hooks.SessionStart[0].hooks).toHaveLength(1);
  expect(installedCommand()).toBe('"${CLAUDE_PROJECT_DIR}/.claude/skills/specops/scripts/specops"');
});
