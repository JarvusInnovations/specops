import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { AxiError, computeSessionStartHookUpdate, type HookSettings } from "axi-sdk-js";
import { parseArgs } from "../args.js";
import { renderObject, renderHelp, renderOutput } from "../toon.js";

export const HOOK_HELP = `usage: specops hook <install|uninstall> [--scope project|global] [--dir <path>]
       specops hook status

Manage the SessionStart hook that loads this repo's plans dashboard at the start
of every agent session — so an agent sees what's ready / blocked from turn 1.

Default scope is project: the hook is written to <repo>/.claude/settings.json, so
it only fires for sessions in that repo and reads its plans/ (sessions start at
the repo root). --dir sets the repo root (default: the git repo root of the
current directory). Use --scope global to install it in ~/.claude/settings.json
for every session instead.

  hook install                              project hook for the current repo (default)
  hook install --dir ../other-repo          project hook for another repo
  hook install --scope global               hook for every session, any repo
  hook uninstall [--scope project|global]   remove it (default scope project)
  hook status                               report where the hook is installed`;

const MARKER = "specops";
const TIMEOUT_SECONDS = 10;

type Scope = "project" | "global";

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

/** Repo root for a project-scoped hook: explicit --dir, else the git repo root. */
function projectBase(flags: Record<string, string | boolean>): string {
  const dir = flags.dir;
  if (typeof dir === "string" && dir) return resolve(dir);
  const root = gitRoot();
  if (root) return root;
  throw new AxiError(
    "Couldn't determine the project directory (current directory is not a git repository)",
    "VALIDATION_ERROR",
    ["Pass --dir <project-path>, or run from inside the target repo"],
  );
}

/** Resolve scope, defaulting to project; validate when provided. */
function resolveScope(flags: Record<string, string | boolean>): Scope {
  const scope = flags.scope;
  if (scope === undefined) return "project";
  if (scope !== "project" && scope !== "global") {
    throw new AxiError("--scope must be project or global", "VALIDATION_ERROR", [
      "specops hook install                 (project — the default)",
      "specops hook install --scope global",
    ]);
  }
  return scope;
}

function settingsPath(scope: Scope, flags: Record<string, string | boolean>): string {
  const base = scope === "global" ? homedir() : projectBase(flags);
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
 * Global scope (~/.claude/settings.json) is per-machine and never committed, and
 * it fires in every repo — including ones that don't vendor specops — so a
 * project-relative path would dangle. There we use the absolute path of the
 * installed shim, which self-locates wherever the global skill lives.
 */
const PROJECT_HOOK_COMMAND = '"${CLAUDE_PROJECT_DIR}/.claude/skills/specops/scripts/specops"';

function hookCommand(scope: Scope): string {
  return scope === "global" ? JSON.stringify(shimPath()) : PROJECT_HOOK_COMMAND;
}

function readSettings(path: string): HookSettings {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    throw new AxiError(`Could not parse ${path}`, "CONFIG_INVALID", ["Fix or remove the malformed JSON file"]);
  }
}

function writeSettings(path: string, settings: HookSettings): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function managedCommand(settings: HookSettings): string | undefined {
  const groups = settings.hooks?.SessionStart;
  if (!Array.isArray(groups)) return undefined;
  for (const group of groups) {
    for (const hook of group.hooks ?? []) {
      if (typeof hook.command === "string" && hook.command.includes(MARKER)) return hook.command;
    }
  }
  return undefined;
}

export async function hookCommand_(args: string[]): Promise<string> {
  const verb = args[0];
  const rest = args.slice(1);
  switch (verb) {
    case "install":
      return install(rest);
    case "uninstall":
      return uninstall(rest);
    case "status":
      return status();
    default:
      throw new AxiError(`Unknown hook subcommand: ${verb ?? "(none)"}`, "VALIDATION_ERROR", [
        "Use: hook install [--scope] [--dir] | hook uninstall [--scope] | hook status",
      ]);
  }
}

function install(args: string[]): string {
  const { flags } = parseArgs(args);
  const scope = resolveScope(flags);
  const path = settingsPath(scope, flags);
  const command = hookCommand(scope);

  const settings = readSettings(path);
  const [updated, changed] = computeSessionStartHookUpdate(settings, {
    marker: MARKER,
    command,
    timeoutSeconds: TIMEOUT_SECONDS,
  });

  if (changed) writeSettings(path, updated);
  return renderOutput([
    renderObject({ hook: changed ? "installed" : "already up to date", scope, file: path, runs: command }),
    renderHelp([
      "Every session in this scope opens with the plans dashboard",
      `Run \`specops hook uninstall --scope ${scope}\` to remove it`,
    ]),
  ]);
}

function uninstall(args: string[]): string {
  const { flags } = parseArgs(args);
  const scope = resolveScope(flags);
  const path = settingsPath(scope, flags);

  if (!existsSync(path)) {
    return renderObject({ hook: "not installed (no-op)", scope, file: path });
  }

  const settings = readSettings(path);
  const groups = settings.hooks?.SessionStart;
  let removed = 0;
  if (Array.isArray(groups)) {
    for (const group of groups) {
      const before = group.hooks?.length ?? 0;
      if (group.hooks) {
        group.hooks = group.hooks.filter(
          (h) => !(typeof h.command === "string" && h.command.includes(MARKER)),
        );
      }
      removed += before - (group.hooks?.length ?? 0);
    }
    settings.hooks!.SessionStart = groups.filter((g) => (g.hooks?.length ?? 0) > 0);
  }

  if (removed > 0) writeSettings(path, settings);
  return renderObject({ hook: removed > 0 ? "removed" : "not installed (no-op)", scope, file: path });
}

function status(): string {
  const describe = (path: string) => {
    const command = existsSync(path) ? managedCommand(readSettings(path)) : undefined;
    return command ? { installed: "yes", runs: command } : { installed: "no" };
  };

  const globalPath = join(homedir(), ".claude", "settings.json");
  const rows: Array<Record<string, unknown>> = [{ scope: "global", file: globalPath, ...describe(globalPath) }];

  const root = gitRoot();
  if (root) {
    const projectPath = join(root, ".claude", "settings.json");
    rows.push({ scope: "project", file: projectPath, ...describe(projectPath) });
  } else {
    rows.push({ scope: "project", file: "(cwd is not a git repo — pass --dir)", installed: "n/a" });
  }

  return renderOutput([
    renderObject({ hooks: rows }),
    renderHelp(["Run `specops hook install` to load this repo's plans dashboard each session"]),
  ]);
}
