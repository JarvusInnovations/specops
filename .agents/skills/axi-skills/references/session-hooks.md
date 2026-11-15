# SessionStart hooks: `setup hooks`, user vs project scope

A bundled AXI CLI earns its keep when every agent session opens already knowing the relevant
state — without the agent invoking anything. You get that by registering a `SessionStart` hook
that runs your CLI's cheap home (or dashboard) view and injects its output as initial context.

This doc covers the `setup hooks` command, the **user vs project scope** distinction, and — the
part the upstream `axi` skill doesn't go deep on — **project-level hooks and extended dashboards**
for skills installed into a specific repo.

## The `setup hooks` command shape

Manage hooks explicitly — don't rely on the SDK's auto-install (it no-ops on `.mjs` names; see
SKILL.md gotchas). Use the command name the upstream reference tools use (`gh-axi`,
`chrome-devtools-axi`) and the SDK documentation recommends: **`setup hooks`**. Run bare, it
installs the hook, or repairs it if the path or payload is stale. It is idempotent.

```
mytool setup hooks           [--scope user|project] [--dir <path>] [--dashboard] [<entity-refs>...]
mytool setup hooks status    [--scope user|project] [--dir <path>]
mytool setup hooks uninstall [--scope user|project] [--dir <path>]
```

- Bare `setup hooks` always means install-or-repair. That is the whole upstream surface, and it
  is enough for many tools.
- `--scope`, `status`, `uninstall` and payload selection are extensions. Add the ones your tool
  needs. `status` and `uninstall` are worth having as soon as you support project scope, because
  a committed hook is something a team will want to inspect and remove.
- The scope words are the SDK's: `user` (the agent's home-directory config) and `project` (the
  repo's own config).
- `setup hooks` is the **only** code path that writes a hook. Other commands may report hook
  state; none installs one as a side effect.

Don't use a top-level `hook install|uninstall|status` command. Earlier versions of this recipe
did; the upstream tools settled on `setup hooks`, and matching them means an agent that has used
one AXI tool already knows yours.

### SDK helpers, or build on the primitive?

Since `axi-sdk-js` gained hook scopes
([kunchenguid/axi#140](https://github.com/kunchenguid/axi/pull/140)), the SDK covers more of this
than it used to:

| SDK export | Does |
| --- | --- |
| `installSessionStartHooks({ scope, projectDir, marker })` | Installs for Claude Code, Codex and OpenCode at user or project scope |
| `sessionStartHookStatus({ scope })` | Reports each agent's install state; no writes |
| `uninstallSessionStartHooks({ scope })` | Removes only entries carrying your marker |
| `computeSessionStartHookUpdate(settings, { marker, command, timeoutSeconds })` | The lower-level, idempotent merge for one settings object |

**Use the high-level helpers** when their behavior fits: all three agents, the home view as the
payload, and the command the SDK resolves.

**Build on `computeSessionStartHookUpdate`** when a skill-bundled CLI needs something they don't
do yet (tracked in [kunchenguid/axi#46](https://github.com/kunchenguid/axi/issues/46)):

- a payload other than the zero-argument home view (`dashboard`, or `dashboard <refs>`)
- one agent only (Claude Code), not all three
- a `${CLAUDE_PROJECT_DIR}`-relative command for a committed project hook (below)

Either way, match your own entries by a `marker` (your tool name) so `uninstall` removes *only*
yours and leaves the user's other hooks untouched.

### Fail closed

An installer that reports success it didn't achieve is the most common defect in this command.

- **Any write error is a failure.** The SDK reports some write failures only through its
  `onError` callback. Collect them and exit non-zero. Never print "completed with a warning" and
  exit 0.
- **Re-read after installing.** The SDK silently declines entrypoints it doesn't consider
  installed (a dev `.ts` entrypoint, a filename containing a dot). Check status after the install
  and fail if the hook isn't there.
- **An unreadable settings file is an error,** in install, status and uninstall. It is not "not
  installed", and it is never overwritten.
- A repeat that changes nothing says so (`already installed … (no-op)`) and leaves the file
  bytes unchanged.

## User scope — every session, any repo

Written to `~/.claude/settings.json`. Per-machine, never committed, fires in every repo. The hook
command is the **absolute path** of the installed shim, resolved from the bundle's own location:

```ts
function shimPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "mytool");
}
// user-scope hook command:
JSON.stringify(shimPath())
```

An absolute path is correct here precisely *because* the hook fires in repos that don't vendor
your skill — a project-relative path would dangle. The shim self-locates wherever the skill is
installed for the user (`~/.agents/skills/<name>/scripts/mytool`, with `~/.claude/skills/<name>`
symlinked).

This pairs with a **cheap home view** — see `references/home-vs-dashboard.md`. It loads on
*every* session, so it must be fast and never error.

## Project scope — one repo, committed, portable

This is the extended concept that matters when **installing an AXI-powered skill at the project
level**.

Written to `<repo>/.claude/settings.json`, which is **committed** — so every contributor
and CI machine gets the hook. That forces two requirements:

1. **The command must be portable across machines** — no absolute, machine-specific paths.
2. **It must resolve to the skill as vendored in *this* repo.**

The answer is a `${CLAUDE_PROJECT_DIR}`-relative path to the vendored skill's shim (the
`.claude/skills/<name>` symlink that the project install creates):

```ts
const PROJECT_HOOK_COMMAND =
  '"${CLAUDE_PROJECT_DIR}/.claude/skills/mytool/scripts/mytool"';

function hookCommand(scope: Scope): string {
  return scope === "user" ? JSON.stringify(shimPath()) : PROJECT_HOOK_COMMAND;
}
```

- `${CLAUDE_PROJECT_DIR}` is expanded by Claude Code at hook time to the repo root → portable.
- Quoted so a project directory containing spaces is safe.
- The SDK's project scope writes the resolved binary path instead, which suits a tool on `PATH`
  but is machine-specific for a vendored bundle. That is why a bundled CLI builds this command
  itself.

**Where the settings file goes.** The project base is the explicit `--dir`, else the git repo
root (`git rev-parse --show-toplevel`). If neither resolves, **error**. Never fall back to the
current directory: an agent often runs a bundled CLI from inside its skill folder, and a hook
written there does nothing. (The SDK's `projectDir` defaults to the current directory, so pass
it explicitly.)

**Which scope is the default.** The upstream default is `user`. Make `project` the default when
the tool is fundamentally about the current repo's state (specops reads `./plans`), so bare
`setup hooks` does the common thing.

### Hooks stack — user + project both fire

Claude Code runs SessionStart hooks from **both** user and project settings, additively. So a
session opened in a repo that has a project hook gets: the **user-scope home** view (injected
once) **plus** the **project dashboard** view (live state) — stacked. Design for this: the
project dashboard should *omit* the command reference, because the home hook already injected it
that session. Two complementary, non-duplicative payloads.

## Payload selection: home vs dashboard vs entity

A hook shouldn't be limited to the zero-arg home view. Let `setup hooks` choose what the hook
runs (item #2 in axi#46):

- **default → `home`**: cheap and safe. Best as the user-scope, every-session hook.
- **`--dashboard` → `dashboard`**: live situational state. Best as a project hook.
- **`<entity-refs>… [--related]` → entity dashboard**: pin the hook to specific entities so a repo
  opens already oriented to the engagement it's about (see below).

Re-running `setup hooks` with different options replaces the installed payload.

Because `runAxiCli` rejects flags *before* a command and the home view is strictly zero-arg, a hook
can't pin context with `home --dir x`. Instead, the hook relies on the SessionStart working
directory (cwd = repo root) to scope itself, or it runs a subcommand that *does* accept the
parameters (`dashboard project:x`). Keep this in mind when designing what the hook runs.

## Extended / entity dashboards for project installs

When a skill is installed at the project level, the most valuable session-start context is often
*"what is this repo's engagement about"* — not generic personal state. That's the **entity (or
extended) dashboard**: a payload that blends one or more specific entities into a focused
situational view.

A proven model, generalized:

- `dashboard <type:slug> [<type:slug>…] [--related]` resolves a set of focal entities and renders a
  **blended** view: the focal entities, their merged open items (commitments/tasks), a merged
  chronological activity feed, and the surrounding identifier neighborhood. `--related` does a
  one-hop expansion across foreign keys to pull in neighbors.
- Install it as a **project-pinned hook** so the repo opens oriented to exactly that work:

  ```
  mytool setup hooks --scope project project:acme proposal:q3 org:transit --related
  ```

  Now every session in that repo starts knowing the project, its proposal, and the org, with their
  open commitments and recent activity already in context.
- A `<type>:*` wildcard can pin a whole type (`'proposal:*'`). Show it quoted in examples so the
  shell doesn't glob it. Report an unsupported type as unresolved; don't drop it silently.

Design principles for the extended dashboard (these are where project-level dashboards go wrong):

- **Comprehensive in coverage, bounded in depth.** Cover every relevant section, but cap each
  (top-N + truncation + a drill-down pointer) — never dump everything. Session-start context loads
  every time; it must stay token-disciplined even while being broad.
- **Order sections by ambient value.** The most useful orientation first (who/what this is, the
  identifiers an agent will need before it asks), because the tail is what gets cut when context is
  trimmed. Hand the agent identifiers up front so it doesn't have to look them up.
- **Drop redundant columns per surface.** A personal dashboard can omit `assignee` (everything is
  yours); an entity dashboard keeps `assignee` (it shows anyone's). Tune each payload to its
  surface rather than reusing one schema everywhere.
- **Do personalization server-side.** Fold "where you left off" into the data endpoint itself
  (it already knows the user) so the CLI makes **one** call. Don't fake it with extra CLI round
  trips (thin client / server-authoritative).
- **Keep secrets out of the committed hook.** The dashboard reads its credentials from the
  user-level config, so a project hook committed to a repo carries none.

## Gotchas

- **Test hook installs against a temporary home, and prove the redirect works first.** On POSIX,
  Node's `os.homedir()` honors `$HOME`, so a test can point `HOME` (and the XDG variables) at a
  temp directory. Don't assume it: assert once, in your own runtime and test runner, that the
  installer resolved the temp path. If the redirect silently doesn't apply, the test writes to
  your real `~/.claude/settings.json`. The SDK also writes a Codex config under the home
  directory at any scope, so redirect `HOME` even for project-scope tests.
  One trap when a test spawns the CLI as a child process: version-manager shims (asdf and
  similar) locate themselves through `HOME`, so a shimmed `node` or `bun` fails under a redirected
  `HOME`. Spawn the real binary (`process.execPath`), not the shim.
- **Give tests a kill switch.** An environment variable such as `MYTOOL_DISABLE_HOOKS=1` that
  makes every hook write a no-op (and says so) keeps an unrelated test from ever touching real
  agent settings. Set it globally in the test setup.
- **Match by marker, filter precisely.** On `uninstall`, filter `SessionStart` hook entries to
  those whose `command` includes your marker, then drop now-empty groups. Verify other tools'
  hooks are preserved.
- **Codex needs its feature flag.** Codex honors hooks only when its user-level config has
  `[features] hooks = true`. Count Codex as installed only when that is set.
- **Wire the CI drift gate to actually run** — it's easy to claim `check` runs in CI while the
  workflow only runs `tsc`. A stale bundle then passes silently. Confirm the workflow runs
  `bun run check`.
