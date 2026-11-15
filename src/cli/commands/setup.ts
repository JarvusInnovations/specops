import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { AxiError, computeSessionStartHookUpdate, type HookSettings } from "axi-sdk-js";
import { parseFlags, shellQuote, type FlagSpec } from "../flags.js";
import { cliInvocation } from "../invocation.js";
import { renderObject, renderHelp, renderOutput } from "../toon.js";

export const SETUP_HELP = `usage: specops setup hooks           [--scope user|project] [--dir <path>]
       specops setup hooks status    [--scope user|project] [--dir <path>]
       specops setup hooks uninstall [--scope user|project] [--dir <path>]

Manage the SessionStart hook that loads this repo's plans dashboard at the start
of every agent session — so an agent sees what's ready / blocked from turn 1.

Bare \`setup hooks\` installs the hook, or repairs it if it is stale. It is
idempotent: a repeat that changes nothing leaves the settings file untouched.

Default scope is project: the hook is written to <repo>/.claude/settings.json, so
it only fires for sessions in that repo and reads its plans/ (sessions start at
the repo root). --dir sets the repo root (default: the git repo root of the
current directory; never the bare current directory). Use --scope user to
install it in ~/.claude/settings.json for every session instead.

  setup hooks                          project hook for the current repo (default)
  setup hooks --dir ../other-repo      project hook for another repo
  setup hooks --scope user             hook for every session, any repo
  setup hooks status                   report where the hook is installed (both scopes)
  setup hooks status --scope project   report one scope only
  setup hooks uninstall                remove it (default scope project)
`;

const MARKER = "specops";
const TIMEOUT_SECONDS = 10;

const COMMAND = "setup hooks";
const TOPICS = ["hooks"] as const;
const ACTIONS = ["status", "uninstall"] as const;
const SCOPES = ["user", "project"] as const;

type Scope = (typeof SCOPES)[number];
type Action = (typeof ACTIONS)[number];
type Flags = Record<string, string | true>;

const FLAG_SPEC: FlagSpec = {
  value: ["scope", "dir"],
  deprecated: {
    "--global": "--global is not a flag of this command; use --scope user",
    "--user": "--user is not a flag of this command; use --scope user",
    "--project": "--project is not a flag of this command; use --scope project (the default)",
  },
};

/**
 * The corrected / follow-up call for a hint: the resolved invocation (the bundle
 * is not on PATH) plus the action and the caller's own flags.
 */
function call(action: Action | undefined, flags: { scope?: string; dir?: string }): string {
  const parts = [cliInvocation(), COMMAND];
  if (action) parts.push(action);
  if (flags.scope) parts.push("--scope", shellQuote(flags.scope));
  if (flags.dir) parts.push("--dir", shellQuote(flags.dir));
  return parts.join(" ");
}

function usageLines(): string[] {
  const cli = cliInvocation();
  return [
    `Usage: ${cli} setup hooks [--scope user|project] [--dir <path>]   (install or repair)`,
    `Usage: ${cli} setup hooks status [--scope user|project] [--dir <path>]`,
    `Usage: ${cli} setup hooks uninstall [--scope user|project] [--dir <path>]`,
  ];
}

function stringFlag(flags: Flags, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

function gitRoot(): string | undefined {
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return root || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Repo root for a project-scoped hook: explicit --dir, else the git repo root,
 * else an error. Never the bare cwd — an agent often runs the bundled CLI from
 * inside the skill folder, and a hook written there does nothing.
 */
function projectBase(flags: Flags): string {
  const dir = stringFlag(flags, "dir");
  if (dir) return resolve(dir);
  const root = gitRoot();
  if (root) return root;
  throw new AxiError(
    "Couldn't determine the project directory (current directory is not a git repository)",
    "VALIDATION_ERROR",
    ["Pass --dir <project-path>, or run from inside the target repo"],
  );
}

/** Validate --scope when provided. `global` is the retired name for `user`. */
function parseScope(flags: Flags, action: Action | undefined): Scope | undefined {
  const scope = stringFlag(flags, "scope");
  if (scope === undefined) return undefined;
  if (scope === "global") {
    throw new AxiError("--scope global is now --scope user", "VALIDATION_ERROR", [
      `Run \`${call(action, { scope: "user", dir: stringFlag(flags, "dir") })}\``,
    ]);
  }
  if (!(SCOPES as readonly string[]).includes(scope)) {
    throw new AxiError(`Unknown --scope value: ${scope}`, "VALIDATION_ERROR", [
      `Valid --scope values: ${SCOPES.join(", ")} (default: project)`,
    ]);
  }
  return scope as Scope;
}

function settingsPath(scope: Scope, flags: Flags): string {
  const base = scope === "user" ? homedir() : projectBase(flags);
  return join(base, ".claude", "settings.json");
}

/** Absolute path to the bundle's sibling `specops` shim on this machine. */
function shimPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "specops");
}

/**
 * The command the hook runs: the bare `specops` shim (home dashboard).
 * SessionStart hooks run with cwd at the workspace root, so the home view
 * resolves ./plans for that repo.
 *
 * Project scope must be portable: the hook is written to <repo>/.claude/
 * settings.json and committed, so it has to work on every machine and for every
 * contributor. We emit a `${CLAUDE_PROJECT_DIR}`-relative path to the vendored
 * skill's shim (the .claude/skills/specops symlink the install creates) — never
 * a machine-specific absolute path. Quoted so a project dir with spaces is safe.
 *
 * User scope (~/.claude/settings.json) is per-machine and never committed, and
 * it fires in every repo — including ones that don't vendor specops — so a
 * project-relative path would dangle. There we use the absolute path of the
 * installed shim, which self-locates wherever the user-level skill lives.
 */
const PROJECT_HOOK_COMMAND = '"${CLAUDE_PROJECT_DIR}/.claude/skills/specops/scripts/specops"';

function hookCommand(scope: Scope): string {
  return scope === "user" ? JSON.stringify(shimPath()) : PROJECT_HOOK_COMMAND;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read a settings file, failing closed. A missing file is `undefined`; anything
 * else we can't read, parse, or recognize the shape of is an error — never
 * treated as empty, because the caller would then overwrite the user's file.
 */
function readSettings(path: string): HookSettings | undefined {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new AxiError(`Could not read ${path}: ${messageOf(error)}`, "CONFIG_UNREADABLE", [
      "Fix the file's permissions; it was left untouched",
    ]);
  }

  const invalid = (why: string) =>
    new AxiError(`Could not parse ${path}: ${why}`, "CONFIG_INVALID", [
      "Fix or remove the malformed JSON file; it was left untouched",
    ]);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw invalid(messageOf(error));
  }
  if (!isPlainObject(parsed)) throw invalid("expected a JSON object at the top level");
  if (parsed.hooks !== undefined) {
    if (!isPlainObject(parsed.hooks)) throw invalid("`hooks` is not an object");
    const groups = parsed.hooks.SessionStart;
    if (groups !== undefined && !(Array.isArray(groups) && groups.every(isPlainObject))) {
      throw invalid("`hooks.SessionStart` is not an array of hook groups");
    }
  }
  return parsed as HookSettings;
}

/** Any write error is a failure (exit 1) — never "completed with a warning". */
function writeSettings(path: string, settings: HookSettings): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  } catch (error) {
    throw new AxiError(`Could not write ${path}: ${messageOf(error)}`, "SETUP_FAILED", [
      "Nothing was installed or removed; fix the path's permissions and re-run",
    ]);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isManaged(hook: { command?: unknown }): boolean {
  return typeof hook.command === "string" && hook.command.includes(MARKER);
}

function managedCommand(settings: HookSettings): string | undefined {
  for (const group of settings.hooks?.SessionStart ?? []) {
    if (!Array.isArray(group.hooks)) continue;
    for (const hook of group.hooks) {
      if (isManaged(hook)) return hook.command;
    }
  }
  return undefined;
}

export async function setupCommand(args: string[]): Promise<string> {
  const { positionals, flags } = parseFlags(COMMAND, args, FLAG_SPEC);
  const [topic, action, ...extra] = positionals;
  const carried = { scope: stringFlag(flags, "scope"), dir: stringFlag(flags, "dir") };

  if (topic !== "hooks") {
    throw new AxiError(
      topic === undefined ? "Missing setup subcommand" : `Unknown setup subcommand: ${topic}`,
      "VALIDATION_ERROR",
      [`Valid setup subcommands: ${TOPICS.join(", ")}`, ...usageLines()],
    );
  }

  if (action !== undefined && !(ACTIONS as readonly string[]).includes(action)) {
    if (action === "install" || action === "repair") {
      throw new AxiError(
        `\`setup hooks ${action}\` is not an action — bare \`setup hooks\` installs or repairs`,
        "VALIDATION_ERROR",
        [`Run \`${call(undefined, carried)}\``],
      );
    }
    throw new AxiError(`Unknown setup hooks action: ${action}`, "VALIDATION_ERROR", [
      `Valid actions: ${ACTIONS.join(", ")} (no action = install or repair)`,
      ...usageLines(),
    ]);
  }

  if (extra.length > 0) {
    throw new AxiError(
      `Unexpected argument${extra.length > 1 ? "s" : ""}: ${extra.map(shellQuote).join(" ")}`,
      "VALIDATION_ERROR",
      [`\`setup hooks\` takes at most one action (${ACTIONS.join(", ")})`, ...usageLines()],
    );
  }

  const scope = parseScope(flags, action as Action | undefined);
  switch (action) {
    case "status":
      return status(scope, flags);
    case "uninstall":
      return uninstall(scope ?? "project", flags);
    default:
      return install(scope ?? "project", flags);
  }
}

function install(scope: Scope, flags: Flags): string {
  const path = settingsPath(scope, flags);
  const command = hookCommand(scope);

  const settings = readSettings(path) ?? {};
  const [updated, changed] = computeSessionStartHookUpdate(settings, {
    marker: MARKER,
    command,
    timeoutSeconds: TIMEOUT_SECONDS,
  });

  if (changed) {
    writeSettings(path, updated);
    // Re-read: only report success the file on disk actually shows.
    const written = readSettings(path);
    if (!written || managedCommand(written) !== command) {
      throw new AxiError(`Hook was not found in ${path} after writing it`, "SETUP_FAILED", [
        `Run \`${call("status", { scope, dir: stringFlag(flags, "dir") })}\` to inspect`,
      ]);
    }
  }

  const dir = stringFlag(flags, "dir");
  return renderOutput([
    renderObject({ hook: changed ? "installed" : "already up to date (no-op)", scope, file: path, runs: command }),
    renderHelp([
      changed
        ? "Restart your agent session to load the hook — every session in this scope opens with the plans dashboard"
        : "Every session in this scope opens with the plans dashboard",
      `Run \`${call("uninstall", { scope, dir })}\` to remove it`,
    ]),
  ]);
}

function uninstall(scope: Scope, flags: Flags): string {
  const path = settingsPath(scope, flags);

  const settings = readSettings(path);
  if (!settings) {
    return renderObject({ hook: "not installed (no-op)", scope, file: path });
  }

  const groups = settings.hooks?.SessionStart;
  let removed = 0;
  if (Array.isArray(groups)) {
    for (const group of groups) {
      if (!Array.isArray(group.hooks)) continue;
      const before = group.hooks.length;
      group.hooks = group.hooks.filter((h) => !isManaged(h));
      removed += before - group.hooks.length;
    }
    // Drop only the groups we emptied; a group that never had hooks isn't ours.
    if (removed > 0) {
      settings.hooks!.SessionStart = groups.filter((g) => !Array.isArray(g.hooks) || g.hooks.length > 0);
    }
  }

  if (removed > 0) writeSettings(path, settings);
  return renderObject({ hook: removed > 0 ? "removed" : "not installed (no-op)", scope, file: path });
}

function status(scope: Scope | undefined, flags: Flags): string {
  const describe = (path: string) => {
    const settings = readSettings(path);
    const command = settings ? managedCommand(settings) : undefined;
    return command ? { installed: "yes", runs: command } : { installed: "no" };
  };

  const rows: Array<Record<string, unknown>> = [];

  if (scope === undefined || scope === "user") {
    const userPath = settingsPath("user", flags);
    rows.push({ scope: "user", file: userPath, ...describe(userPath) });
  }

  if (scope === "project") {
    const projectPath = settingsPath("project", flags);
    rows.push({ scope: "project", file: projectPath, ...describe(projectPath) });
  } else if (scope === undefined) {
    // Reporting both scopes: a missing project is a row, not a failure.
    const dir = stringFlag(flags, "dir");
    const root = dir ? resolve(dir) : gitRoot();
    if (root) {
      const projectPath = join(root, ".claude", "settings.json");
      rows.push({ scope: "project", file: projectPath, ...describe(projectPath) });
    } else {
      rows.push({ scope: "project", file: "(cwd is not a git repo — pass --dir)", installed: "n/a" });
    }
  }

  return renderOutput([
    renderObject({ hooks: rows }),
    renderHelp(
      rows.some((row) => row.installed === "yes")
        ? []
        : [`Run \`${call(undefined, {})}\` to load this repo's plans dashboard each session`],
    ),
  ]);
}

/**
 * `hook` was renamed to `setup hooks`. The old name stays registered so the
 * rename is loud: it fails as a usage error whose hint is the corrected call
 * with the caller's own arguments folded in. Deliberately not an alias.
 */
const RETIRED_VERBS: Record<string, string> = {
  install: "setup hooks",
  status: "setup hooks status",
  uninstall: "setup hooks uninstall",
};

export async function retiredHookCommand(args: string[]): Promise<string> {
  const cli = cliInvocation();
  const verbIndex = args.findIndex((a) => !a.startsWith("-"));
  const verb = verbIndex === -1 ? undefined : args[verbIndex];
  const replacement = verb === undefined ? undefined : RETIRED_VERBS[verb];

  if (!replacement) {
    throw new AxiError("`hook` is now `setup hooks`", "VALIDATION_ERROR", [
      `Run \`${cli} setup hooks\` to install or repair (was \`hook install\`)`,
      `Run \`${cli} setup hooks status\` (was \`hook status\`)`,
      `Run \`${cli} setup hooks uninstall\` (was \`hook uninstall\`)`,
    ]);
  }

  // Carry the caller's remaining arguments, translating the renamed scope value.
  const rest = args.filter((_, i) => i !== verbIndex);
  const carried: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === "--scope=global") {
      carried.push("--scope", "user");
    } else if (arg === "--scope" && rest[i + 1] === "global") {
      carried.push("--scope", "user");
      i++;
    } else {
      carried.push(shellQuote(arg));
    }
  }

  throw new AxiError(`\`hook ${verb}\` is now \`${replacement}\``, "VALIDATION_ERROR", [
    `Run \`${[cli, replacement, ...carried].join(" ")}\``,
  ]);
}
