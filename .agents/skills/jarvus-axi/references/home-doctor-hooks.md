# Home view, `doctor` and session hooks

## Contents

- [The home view](#the-home-view)
- [Home or dashboard](#home-or-dashboard)
- [`doctor`](#doctor)
- [The hook command: `setup hooks`](#the-hook-command-setup-hooks)
- [Hook installation rules](#hook-installation-rules)
- [What a hook may print](#what-a-hook-may-print)
- [`update`](#update)

## The home view

The no-argument view is what a session hook injects, so it runs at the start of every agent
session, often with no network, an expired token or no configuration at all. Three rules
follow.

**It never fails.** It never throws, never exits non-zero, and never hangs.

- Not configured: one status line and the exact setup command. Exit 0.

  ```
  setup: no credentials configured
  help[1]:
    Run `tool auth setup` to connect your account
  ```

- A live read failed: say so for that field, and keep the rest.

  ```
  bookings: unavailable (TOKEN_EXPIRED: session expired)
  help[1]:
    Run `tool doctor` to check credentials and connectivity
  ```

  "Nothing booked" after an expired token would be a confident lie. `unavailable` is true.
- The network is down but a cache exists: show the cached data with its age
  (`(cached, 4h old — service unreachable)`).

**It never does work that grows with the account.** A home view that listed a whole document
tree took 14 seconds against a 10-second hook budget, so the hook printed nothing at all.

- Bound live content: the top five to eight items, one API call at most, a timeout of a few
  seconds per source.
- Prefer local reads: cached identity, a small cache keyed on the account's change counter.
- Use a count query, not a list-everything query.
- Give it a performance test with a budget.
- Don't refresh sessions, bump activity timers or write anything as a side effect of home.

**It is scoped and private.**

- Scope it to the current directory or project where the data has that shape. With nothing in
  scope, say so (`project: none for <cwd>`) and offer widening commands. Never fall back to
  showing data from elsewhere.
- Where data belongs to a user and not a directory (a messaging account), a project opts in
  with a small config file naming what to show. Without it, a project-scoped hook prints
  nothing.
- A hook's output lands in every session's context. Show names, states and counts. Never
  message text, contact names, phone numbers or document contents.

What it shows, in order: the SDK's `bin:` and `description:` lines, a `status:` or account
line, bounded live content, then `help[]` that depends on state and ends with the discovery
line (`output-vocabulary.md`).

## Home or dashboard

Upstream's principle 8 wants the no-argument view to show live content. `axi-skills` describes
splitting a lean identity-only `home` from a live `dashboard`. Both are right in different
situations, and upstream has declined to make either a rule, so choose per tool:

- **Live content in home** suits a tool whose live state is small, cheap and what the agent
  needs every session: today's bookings, the running timer. Most of our npm tools do this,
  kept safe by the rules above.
- **Lean home plus a `dashboard` command** suits a tool whose live view is large, costs a
  server round trip, or only matters in some repos. Home then shows identity, auth status and
  how to drive the tool; the dashboard is opt-in per project (see the hook payload options
  below).

## `doctor`

`doctor` is where every "something is wrong" hint points, so it must work when everything else
doesn't.

```
checks[5]{check,status,detail}:
  config,ok,~/.config/tool/config.json
  credentials,ok,from config
  api,fail,TOKEN_EXPIRED: session expired
  rate_limit,skipped,needs api
  hooks,ok,installed at user scope
```

- Rows are `{check,status,detail}` with status `ok`, `fail` or `skipped`.
- A check that depends on a failed check is `skipped`, not `fail`.
- Any `fail` exits 1.
- Each probe has a tight deadline and reports `unknown` when it expires. A `doctor` that hangs
  is broken diagnostics.
- Include a hooks row. A missing hook is `skipped` (it is optional); a broken one is `fail`.
- Report the credential source (`env` or `config`), and compare versions where the tool has
  several parts (CLI, daemon, bundled binary).
- `doctor --summary` gives a one-line health check for scripts.
- `doctor` is the only command that may refer to the repo's specs.

## The hook command: `setup hooks`

Follow the upstream reference tools. gh-axi, chrome-devtools-axi and lavish-axi all expose a
single explicit command, and the SDK documentation recommends the same name:

```
<tool> setup hooks
```

It installs the SessionStart hook, or repairs it if the path is stale. It is idempotent. That
bare form is always present and always means install-or-repair.

We extend it in three ways. Add only the ones a tool needs.

### Scope

```
<tool> setup hooks [--scope user|project] [--dir <path>]
```

- `user` (the default) writes the agent's home-directory config, so the hook runs in every
  session.
- `project` writes the repo's own agent config, so it travels with the repo and applies only
  there.
- The words are the SDK's (`scope: "user" | "project"`).
- **The project target is `--dir <path>` if given, else the git root of the current
  directory, else an error.** Never the bare current directory. An agent often runs a bundled
  CLI from inside its skill folder, and a hook written there does nothing.
- Choose the default by where the data lives. A tool whose content is per-repo may default to
  project.

### Status and uninstall

```
<tool> setup hooks status    [--scope user|project]
<tool> setup hooks uninstall [--scope user|project]
```

These are optional. The SDK provides `sessionStartHookStatus()` and
`uninstallSessionStartHooks()` for them. Add them when the tool supports project scope or is
going to the catalog, where a reviewer will exercise them.

- `status` reports each agent's target as `installed`, `stale`, `absent` or `error`.
- An unreadable target is a `problems[]` row, not "not installed".
- `uninstall` names every file it changed and every file it couldn't.

Do not use a top-level `hook install|status|uninstall` command. Some of our tools have it, and
it isn't the upstream shape.

### Payload

For a tool that has both a lean home and a live dashboard, the hook can install either:

```
<tool> setup hooks                                   # home payload, user scope
<tool> setup hooks --scope project --dashboard       # live dashboard for this repo
<tool> setup hooks --scope project project:website   # dashboard pinned to one entity
<tool> setup hooks --scope project 'proposal:*'      # dashboard over a whole type
```

- The default payload is `home`: cheap and safe for every session.
- `--dashboard` installs the personal live view.
- Positional `<type>:<slug>` references install a dashboard pinned to those entities, with
  `--related` to expand to linked ones. A `<type>:*` wildcard covers a type; show it quoted in
  examples so the shell doesn't glob it.
- An unsupported type is reported as unresolved, naming the supported set.
- The usual pairings are home with user scope, and dashboard with project scope: a repo for
  one engagement opens every session on that engagement's state.
- The dashboard reads its credentials from the user-level config, so a project hook committed
  to a repo carries no secret.
- Re-running `setup hooks` with different options replaces the installed payload.

The SDK doesn't select hook payloads yet, and its home handler can't take leading flags, so a
tool that does this builds the hook command itself from the SDK's exported primitives. The
`axi-skills` skill's session-hooks reference has the details.

## Hook installation rules

- **`setup hooks` is the only code path that writes a hook.** Auth and setup commands may
  report hook state read-only. Nothing installs a hook as a side effect or on first run.
- **Any SDK `onError` is a failure.** `installSessionStartHooks` reports some write failures
  only through its `onError` callback. Collect those, and exit 1 with `SETUP_FAILED`. "Completed
  with a warning" on exit 0 is a fail-open and a known catalog blocker.
- **Re-read after installing.** The SDK silently declines entrypoints it doesn't consider
  installed (a `.ts` dev entrypoint, a bundle filename containing a dot). Check status after
  the install and fail if the hook isn't there.
- A repeat that changes nothing says `already installed and current at <scope> scope (no-op)`
  and leaves the file bytes unchanged.
- Codex honors hooks only when its user-level config has `[features] hooks = true`. Count Codex
  as current only when that is set.
- Under a version manager (asdf, nvm shims) the binary on `PATH` may not be the one running.
  The SDK writes the bare name when `PATH` resolves to the running binary and an absolute path
  otherwise; `status` reports `stale` when that stops being true.
- `<TOOL>_AXI_DISABLE_HOOKS=1` makes every hook write a no-op that says so. Tests set it
  always. This is a test and sandbox guard, not a user feature.
- Hook timeout is 10 seconds. The home view should finish far inside it.
- If the tool needs guarantees the SDK installer doesn't give (exact ownership of entries,
  atomic writes, honoring `CLAUDE_CONFIG_DIR`), write the settings merges in the tool, as
  agent-recall-axi does, and keep the command surface above.

Print what was installed, then a restart note:

```
hooks:
  status: installed
  integrations: Claude Code, Codex, OpenCode
  scope: user
help[1]:
  Restart your agent session to load the hook
```

## What a hook may print

In hook mode the tool may read the SessionStart payload on stdin to choose what to print (for
example, a resume summary after a compaction). Bound that read: a size cap, an idle timeout,
and a fallback to the plain home view on anything unexpected. Open stdin only when it is a
pipe, socket or file.

Session-end capture, which upstream principle 7 also describes, rarely fits our tools. When it
doesn't, record that as the catalog exception and don't build a hook that does nothing.

## `update`

`runAxiCli` provides a built-in `update` command that self-updates from npm. Leave it alone
for a normal npm tool.

Shadow it with your own handler when a stated guarantee forbids what it does. A tool that
promises "no network, ever" replaces it with a print-only command that names the right update
command for how it was installed (npm or skill). A CLI that ships only as a skill bundle
should do the same, since an npm self-update means nothing there.
