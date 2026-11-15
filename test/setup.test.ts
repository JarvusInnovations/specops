import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../src/cli/bin.ts", import.meta.url));
const PROJECT_HOOK = '"${CLAUDE_PROJECT_DIR}/.claude/skills/specops/scripts/specops"';

let home: string; // redirected HOME — nothing here may touch the real one
let repo: string; // a git repo to act as the project
let plain: string; // a non-git directory

const childEnv = () => ({ ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config") });

beforeEach(() => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "specops-setup-test-")));
  home = join(base, "home");
  repo = join(base, "repo");
  plain = join(base, "plain");
  for (const d of [home, repo, plain]) mkdirSync(d);
  // Prove the redirect takes effect in the runtime the CLI runs under before any
  // test can write. (It does NOT apply in-process: bun's os.homedir() ignores a
  // runtime change to process.env.HOME, so every test goes through a child.)
  const probe = spawnSync(process.execPath, ["-e", 'console.log(require("node:os").homedir())'], {
    encoding: "utf8",
    env: childEnv(),
  });
  expect(probe.stdout.trim()).toBe(home);
  const init = spawnSync("git", ["init", "-q", repo], { encoding: "utf8" });
  expect(init.status).toBe(0);
});

afterEach(() => {
  rmSync(join(home, ".."), { recursive: true, force: true });
});

/**
 * Run the real CLI entrypoint as a child process, so exit codes are the ones a
 * caller sees. Spawns `process.execPath` (the real runtime binary, never a
 * version-manager shim — shims locate themselves through HOME and break under
 * the redirect).
 */
function run(args: string[], cwd: string = repo) {
  expect(process.execPath).not.toContain("/shims/");
  const result = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: "utf8",
    env: childEnv(),
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

const settingsFile = (base: string) => join(base, ".claude", "settings.json");
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

function seed(base: string, content: string): string {
  mkdirSync(join(base, ".claude"), { recursive: true });
  writeFileSync(settingsFile(base), content);
  return settingsFile(base);
}

function hookEntry(command: string) {
  return { hooks: { SessionStart: [{ matcher: "", hooks: [{ type: "command", command, timeout: 10 }] }] } };
}

/** The `Run \`<invocation> <args…>\`` hint, split into the invocation-less args. */
function hintArgs(out: string): string[] {
  const match = out.match(/Run `(.+)`/);
  expect(match).not.toBeNull();
  const call = match![1]!;
  const at = call.indexOf(" setup hooks");
  expect(at).toBeGreaterThan(0);
  // The bundle is not on PATH, so a hint must never be a bare `specops …`.
  expect(call.slice(0, at)).toMatch(/\/|^node /);
  return call.slice(at + 1).split(" ");
}

// --- the three forms -------------------------------------------------------

test("bare `setup hooks` installs a portable project hook at the git root, and is idempotent", () => {
  const sub = join(repo, "deep", "er");
  mkdirSync(sub, { recursive: true });

  const first = run(["setup", "hooks"], sub);
  expect(first.code).toBe(0);
  expect(first.out).toContain("hook: installed");
  expect(first.out).toContain("scope: project");
  // Git root, not the bare cwd.
  expect(existsSync(settingsFile(sub))).toBe(false);
  const settings = readJson(settingsFile(repo));
  expect(settings.hooks.SessionStart).toHaveLength(1);
  const hook = settings.hooks.SessionStart[0].hooks[0];
  expect(hook).toEqual({ type: "command", command: PROJECT_HOOK, timeout: 10 });
  expect(hook.command).not.toMatch(/\/Users\/|\/home\/|\.agents\//);

  const bytes = readFileSync(settingsFile(repo), "utf8");
  const second = run(["setup", "hooks"], sub);
  expect(second.code).toBe(0);
  expect(second.out).toContain("already up to date (no-op)");
  expect(readFileSync(settingsFile(repo), "utf8")).toBe(bytes);
  expect(existsSync(settingsFile(home))).toBe(false);
});

test("project scope outside a git repo is an error, never the bare cwd", () => {
  const result = run(["setup", "hooks"], plain);
  expect(result.code).toBe(2);
  expect(result.out).toContain("not a git repository");
  expect(result.out).toContain("--dir");
  expect(existsSync(join(plain, ".claude"))).toBe(false);
});

test("--dir sets the project target", () => {
  const result = run(["setup", "hooks", "--dir", plain], home);
  expect(result.code).toBe(0);
  expect(readJson(settingsFile(plain)).hooks.SessionStart[0].hooks[0].command).toBe(PROJECT_HOOK);
});

test("--scope user writes the redirected home's settings with an absolute shim path", () => {
  const result = run(["setup", "hooks", "--scope", "user"]);
  expect(result.code).toBe(0);
  expect(result.out).toContain(`file: ${settingsFile(home)}`);
  const command = readJson(settingsFile(home)).hooks.SessionStart[0].hooks[0].command;
  expect(command).toMatch(/^"\/.*\/specops"$/);
  expect(existsSync(settingsFile(repo))).toBe(false);
});

test("repair: a stale hook from an earlier version is replaced in place, other hooks kept", () => {
  const stale = hookEntry(`node "${repo}/.agents/skills/specops/scripts/specops.mjs"`);
  stale.hooks.SessionStart.unshift({ matcher: "", hooks: [{ type: "command", command: "echo other", timeout: 5 }] });
  seed(repo, `${JSON.stringify({ model: "x", ...stale }, null, 2)}\n`);

  expect(run(["setup", "hooks", "--dir", repo], plain).code).toBe(0);

  const settings = readJson(settingsFile(repo));
  expect(settings.model).toBe("x");
  expect(settings.hooks.SessionStart).toHaveLength(2);
  expect(settings.hooks.SessionStart[0].hooks[0].command).toBe("echo other");
  expect(settings.hooks.SessionStart[1].hooks).toHaveLength(1);
  expect(settings.hooks.SessionStart[1].hooks[0].command).toBe(PROJECT_HOOK);
});

test("`setup hooks status` reports both scopes, and one when --scope is given", () => {
  // A hook written by an earlier version (old `hook install --scope global`) is still recognized.
  const legacy = '"/somewhere/.agents/skills/specops/scripts/specops"';
  seed(home, JSON.stringify(hookEntry(legacy)));

  const both = run(["setup", "hooks", "status"]);
  expect(both.code).toBe(0);
  expect(both.out).toContain(`scope: user\n    file: ${settingsFile(home)}\n    installed: yes`);
  expect(both.out).toContain(`scope: project\n    file: ${settingsFile(repo)}\n    installed: no`);
  expect(both.out).not.toContain("global");

  expect(run(["setup", "hooks"]).code).toBe(0);
  const project = run(["setup", "hooks", "status", "--scope", "project"]);
  expect(project.code).toBe(0);
  expect(project.out).toContain("hooks[1]");
  expect(project.out).toContain(`project,${settingsFile(repo)},yes,`);
  expect(project.out).not.toContain(settingsFile(home));

  const outside = run(["setup", "hooks", "status"], plain);
  expect(outside.code).toBe(0);
  expect(outside.out).toContain("n/a");
  expect(run(["setup", "hooks", "status", "--scope", "project"], plain).code).toBe(2);
});

test("`setup hooks uninstall` removes only our hook, including one from an earlier version", () => {
  const settings = hookEntry(`node "${repo}/.agents/skills/specops/scripts/specops.mjs"`);
  settings.hooks.SessionStart.push({ matcher: "", hooks: [{ type: "command", command: "echo other", timeout: 5 }] });
  seed(repo, JSON.stringify(settings));

  const removed = run(["setup", "hooks", "uninstall"]);
  expect(removed.code).toBe(0);
  expect(removed.out).toContain("hook: removed");
  const after = readJson(settingsFile(repo));
  expect(after.hooks.SessionStart).toHaveLength(1);
  expect(after.hooks.SessionStart[0].hooks[0].command).toBe("echo other");

  const again = run(["setup", "hooks", "uninstall"]);
  expect(again.code).toBe(0);
  expect(again.out).toContain("not installed (no-op)");

  const user = run(["setup", "hooks", "uninstall", "--scope", "user"]);
  expect(user.code).toBe(0);
  expect(user.out).toContain(`file: ${settingsFile(home)}`);
  expect(existsSync(settingsFile(home))).toBe(false);
});

// --- strictness ------------------------------------------------------------

test("--scope global is rejected with a hint to use --scope user", () => {
  for (const action of [[], ["status"], ["uninstall"]]) {
    const result = run(["setup", "hooks", ...action, "--scope", "global"]);
    expect(result.code).toBe(2);
    expect(result.out).toContain("--scope global is now --scope user");
    expect(hintArgs(result.out)).toEqual(["setup", "hooks", ...action, "--scope", "user"]);
  }
  expect(existsSync(settingsFile(home))).toBe(false);
  expect(existsSync(settingsFile(repo))).toBe(false);

  const other = run(["setup", "hooks", "--scope=everywhere"]);
  expect(other.code).toBe(2);
  expect(other.out).toContain("user, project");
});

test("unknown flags, actions, subcommands and extra positionals are rejected with the valid ones listed", () => {
  const cases: Array<[string[], RegExp]> = [
    [["setup", "hooks", "--bogus"], /Unknown flag `--bogus`[\s\S]*--scope <value>, --dir <value>/],
    [["setup", "hooks", "status", "--bogus=1"], /Unknown flag `--bogus`[\s\S]*--scope <value>, --dir <value>/],
    [["setup", "hooks", "-s", "user"], /Unknown flag `-s`/],
    [["setup", "hooks", "--global"], /use --scope user/],
    [["setup", "hooks", "--scope"], /--scope requires a value/],
    [["setup", "hooks", "--scope", "user", "--scope", "project"], /more than once/],
    [["setup", "hooks", "remove"], /Unknown setup hooks action: remove[\s\S]*status, uninstall/],
    [["setup", "hooks", "install"], /bare `setup hooks` installs or repairs/],
    [["setup", "hooks", "status", "extra"], /Unexpected argument: extra[\s\S]*status, uninstall/],
    [["setup"], /Missing setup subcommand[\s\S]*Valid setup subcommands: hooks/],
    [["setup", "hook"], /Unknown setup subcommand: hook[\s\S]*Valid setup subcommands: hooks/],
  ];
  for (const [args, expected] of cases) {
    const result = run(args);
    expect(result.out).toMatch(expected);
    expect(result.out).toContain("code: VALIDATION_ERROR");
    expect(result.code).toBe(2);
  }
  expect(existsSync(settingsFile(home))).toBe(false);
  expect(existsSync(settingsFile(repo))).toBe(false);
});

// --- the retired `hook` command -------------------------------------------

test("retired `hook` redirects to `setup hooks` with the caller's arguments carried", () => {
  const cases: Array<[string[], string, string[]]> = [
    [["hook", "install", "--scope", "global"], "`hook install` is now `setup hooks`", ["setup", "hooks", "--scope", "user"]],
    [["hook", "install", "--scope=global"], "`hook install` is now `setup hooks`", ["setup", "hooks", "--scope", "user"]],
    [["hook", "install", "--dir", repo], "`hook install` is now `setup hooks`", ["setup", "hooks", "--dir", repo]],
    [["hook", "status"], "`hook status` is now `setup hooks status`", ["setup", "hooks", "status"]],
    [
      ["hook", "uninstall", "--scope", "project"],
      "`hook uninstall` is now `setup hooks uninstall`",
      ["setup", "hooks", "uninstall", "--scope", "project"],
    ],
  ];
  for (const [args, message, corrected] of cases) {
    const result = run(args, plain);
    expect(result.code).toBe(2);
    expect(result.out).toContain(message);
    expect(result.out).toContain("code: VALIDATION_ERROR");
    expect(hintArgs(result.out)).toEqual(corrected);
  }
  // Not an alias: nothing was written anywhere.
  expect(existsSync(settingsFile(home))).toBe(false);
  expect(existsSync(settingsFile(repo))).toBe(false);

  for (const args of [["hook"], ["hook", "--help"], ["hook", "bogus"]]) {
    const result = run(args);
    expect(result.code).toBe(2);
    expect(result.out).toContain("`hook` is now `setup hooks`");
  }
});

test("the redirect hint is a call that actually works", () => {
  const retired = run(["hook", "install", "--scope", "global"]);
  const corrected = run(hintArgs(retired.out));
  expect(corrected.code).toBe(0);
  expect(readJson(settingsFile(home)).hooks.SessionStart).toHaveLength(1);
});

// --- fail closed -----------------------------------------------------------

test("an unparseable settings file is an error in every form and is never overwritten", () => {
  const broken = '{ "hooks": { "SessionStart": [ // not json\n';
  const path = seed(repo, broken);
  for (const action of [[], ["status"], ["uninstall"]]) {
    const result = run(["setup", "hooks", ...action]);
    expect(result.code).toBe(1);
    expect(result.out).toContain("code: CONFIG_INVALID");
    expect(result.out).toContain(path);
    expect(result.out).not.toContain("installed");
    expect(readFileSync(path, "utf8")).toBe(broken);
  }
});

test("a settings file with an unexpected shape is an error, not something to overwrite", () => {
  for (const content of ["[]", '"text"', "", '{"hooks": []}', '{"hooks": {"SessionStart": {"keep": "me"}}}']) {
    const path = seed(repo, content);
    const result = run(["setup", "hooks"]);
    expect(result.code).toBe(1);
    expect(result.out).toContain("code: CONFIG_INVALID");
    expect(readFileSync(path, "utf8")).toBe(content);
  }
});

test("a write failure exits non-zero instead of reporting success", () => {
  // `.claude` exists as a file, so the settings file can be neither read nor created.
  writeFileSync(join(repo, ".claude"), "not a directory");
  const result = run(["setup", "hooks"]);
  expect(result.code).toBe(1);
  expect(result.out).toMatch(/code: (SETUP_FAILED|CONFIG_UNREADABLE)/);
  expect(result.out).not.toContain("hook: installed");
  expect(readFileSync(join(repo, ".claude"), "utf8")).toBe("not a directory");

  // And a real write error (unwritable directory) — skipped when running as root.
  if (process.getuid?.() !== 0) {
    const { chmodSync } = require("node:fs") as typeof import("node:fs");
    const locked = join(plain, ".claude");
    mkdirSync(locked);
    chmodSync(locked, 0o500);
    try {
      const denied = run(["setup", "hooks", "--dir", plain]);
      expect(denied.code).toBe(1);
      expect(denied.out).toContain("code: SETUP_FAILED");
      expect(denied.out).not.toContain("hook: installed");
    } finally {
      chmodSync(locked, 0o700);
    }
  }
});
