---
name: axi-skills
description: >-
  Packaging-and-distribution recipe for baking an AXI CLI (axi-sdk-js) into a Claude Code
  skill — bundling it under the skill's scripts/ as a self-contained committed .mjs shipped
  via `npx skills add`. This is the build/ship companion to the upstream `axi` skill: `axi`
  covers what good agent-facing CLI output looks like (TOON, schemas, content-first); this
  covers how to ship that CLI *inside a skill*. Use whenever you're turning an AXI tool into
  an installable skill, or working on any of its moving parts — the esbuild → committed .mjs
  build, the bash shim, the SessionStart hook (`setup hooks`, user vs project
  scope), generating SKILL.md from a single-source command reference, the CI drift gate, or
  splitting a lean every-session "home" view from an on-demand live "dashboard". Triggers:
  "bundle my CLI in a skill", "AXI in a skill", "ship this CLI via npx skills", "self-contained
  skill bundle", "add a session-start hook to my skill", "generate SKILL.md from the CLI", or
  noticing a repo with `scripts/build-cli.ts`, a committed `scripts/*-axi.mjs`, or `axi-sdk-js`
  in devDependencies.
---

# AXI-in-skill: bake an AXI CLI into a skill

This skill is a **supplement to the [`axi`](https://github.com/kunchenguid/axi) skill**, scoped
to one specific job: shipping an `axi-sdk-js` CLI *inside* a Claude Code skill so a single
`npx skills add <owner>/<repo>` delivers a ready-to-run, agent-facing tool with no install step.

Division of labor — keep them straight:

| `axi` skill (upstream) | `axi-skills` skill (this one) |
|---|---|
| **What** the CLI prints — TOON output, minimal schemas, content-first home view, structured errors, contextual disclosure | **How** the CLI ships as a skill — esbuild bundle, committed `.mjs`, shim, SessionStart hook, SKILL.md generation, CI gate |
| Read it first / keep it open while writing command handlers | Read it when you're packaging, building, or distributing |

If you're deciding what a command should *output*, that's the `axi` skill. If you're deciding how
the tool gets *built and installed*, you're in the right place.

## When this pattern is worth it

The deciding question is **does the tool make sense as a standalone install?** A general-purpose
tool an agent would reach for in any repo *does* — publish it to npm and let agents run it via
`npx -y mytool` (the [lavish-axi](https://github.com/kunchenguid/lavish-axi) model). The
AXI-in-skill pattern is for tools that **don't** stand alone. Three cases (building on
[agent-skills#7](https://github.com/JarvusInnovations/agent-skills/issues/7)):

1. **The tool only makes sense alongside a skill.** It's significantly more usable as part of a
   skill that supplies the broader functionality or usage protocols the tool assumes. The canonical
   example, specops: the CLI is a thin determinism layer (readiness, ordering, the DAG) over a
   files-first *methodology* — it's near-meaningless without the spec/plan protocol the skill
   teaches. Shipping the protocol (prose) and the tool together is the whole point.
2. **A skill needs helper scripts, and those scripts benefit from AXI principles.** When a skill
   would ship helper scripts anyway, building them as an AXI gets TOON output, structured errors,
   content-first home views, and a session hook "for free" — worth it once the scripts do enough
   that output quality matters.
3. **You want private distribution.** For a tool you don't want on a public registry,
   `npx skills add <owner>/<private-repo>` is a better distribution channel than publishing to npm
   — the committed bundle means a clone just runs, no registry, no install.

If none of these hold — the tool is genuinely standalone and public — prefer npm. And if the
scripts are trivial and rarely called, a couple of plain zero-dep scripts beat any build pipeline.

## The core idea: a committed, self-contained bundle

One esbuild step compiles your TypeScript CLI source into a **single `.mjs` with every
dependency inlined** (`axi-sdk-js`, `@toon-format/toon`, …), committed into the skill's
`scripts/`. It runs under plain `node ≥ 20` on any machine that has only the skill installed —
no `npm install`, no `node_modules`, no npm publish. **The repo *is* the skill.**

Two alternatives were tried and rejected for this use case:

- **Publish to npm, call via `npx -y mytool`** — splits the code across repos and adds a release
  pipeline, and the tool is fetched from the registry on demand (needs network; no good for
  private/offline/reproducible cases). Fine for a standalone public tool — the
  [lavish-axi](https://github.com/kunchenguid/lavish-axi) skill is the public example of this
  model — but overkill when the CLI lives with the skill and must run offline.
- **A bootstrap wrapper that `npm install`s on first call** — adds per-machine first-run
  friction. [agent-skills#7](https://github.com/JarvusInnovations/agent-skills/issues/7) concluded:
  *the committed-bundle route works; drop the bootstrap wrapper.*

## Choose your repo layout

The recipe is identical; only paths change. Three real shapes:

1. **Single-skill repo** (canonical: [specops](https://github.com/JarvusInnovations/specops)) —
   CLI source in `src/cli/`, one skill in `skills/<name>/`. Start here if you can; it shows the
   pattern in isolation.
2. **Multi-skill repo** (canonical: [claude-assist](https://github.com/JarvusInnovations/claude-assist)) —
   several skills, one shared build. `build-cli.ts` and `build-skill.ts` each iterate a `TARGETS`
   array; source lives in `packages/*/src/axi/`.
3. **CLI alongside a server app** — CLI in `src/cli/` shares types with the server; the bundle is
   committed under `skills/<name>/scripts/`. One repo, no cross-repo drift.

## What you'll end up with

```
<repo>/
  src/cli/                      # CLI source (or packages/*/src/axi/ for multi-skill)
    bin.ts                      # entry: await main()
    cli.ts                      # runAxiCli() wiring + command registry
    reference.ts                # SINGLE SOURCE OF TRUTH: DESCRIPTION + COMMAND_GROUPS
    invocation.ts               # cliInvocation() — resolved path for emitted examples
    skill.ts                    # spliceGeneratedRegions() — SKILL.md marker splicer
    commands/{home,setup,...}.ts # handlers (home doubles as the hook payload)
  scripts/
    build-cli.ts                # esbuild → committed .mjs, version-stamp, --check drift gate
    build-skill.ts              # splice generated regions into SKILL.md, --check
  skills/<name>/
    SKILL.md                    # hand-authored prose + machine-generated regions
    scripts/
      <tool>                    # bash shim (executable) — the documented invocation
      <tool>.mjs                # COMMITTED self-contained bundle (linguist-generated)
  .gitattributes                # marks <tool>.mjs linguist-generated
  .github/workflows/check.yml   # type-check + drift gate (--check) + tests
  package.json                  # devDeps: axi-sdk-js, @toon-format/toon, esbuild (pinned)
```

Ready-to-adapt versions of every build/config file are in `references/templates/`.

## The recipe

Work top to bottom; each step has a deep-dive reference and a template.

1. **Add build deps (pinned).** `axi-sdk-js`, `@toon-format/toon`, `esbuild` as devDependencies,
   pinned to exact versions so the committed bundle's bytes are reproducible. Add npm scripts
   `build:cli`, `build:skill`, and a combined `check` that runs both with `--check`.

2. **Make `reference.ts` the single source of truth.** Export `DESCRIPTION` and a
   `COMMAND_GROUPS` array of `{group, commands:[{usage, summary}]}`. The home view's help, the
   `--help` text, and the generated SKILL.md region all derive from this one structure — so the
   skill doc can never drift from the implementation. See `references/skill-md-generation.md`.

3. **Wire `cli.ts` with `runAxiCli()`.** Register `home`, your commands, and a `setup` command for `setup hooks`.
   Watch the two SDK quirks that bite everyone (flags-before-command rejected; the home view is
   zero-arg) — both covered in `references/build-pipeline.md` and `references/session-hooks.md`.

4. **Emit resolved invocation paths, never bare names.** The bundle is **not on `PATH`**. Use
   `cliInvocation()` (template: `references/templates/invocation.ts`) so every emitted example,
   help line, and hook hint points at the real path. A bare `mytool` makes an agent assume it's
   on PATH and the call fails. Detail in `references/build-pipeline.md`.

5. **Build the bundle + shim.** `scripts/build-cli.ts` runs esbuild, stamps the version from
   `git describe`, and offers a `--check` drift gate. Commit `<tool>.mjs` and an executable bash
   shim `<tool>`. Full reasoning (incl. the version-normalization trick) in
   `references/build-pipeline.md`.

6. **Generate the SKILL.md command reference.** Mark a region with
   `<!-- BEGIN/END GENERATED: command-reference -->` and let `build-skill.ts` splice it from
   `COMMAND_GROUPS`. Prose outside the markers is never touched. See
   `references/skill-md-generation.md`.

7. **Add the SessionStart hook command.** `setup hooks` installs or repairs, matching the upstream
   reference tools; add `--scope user|project` and `status` / `uninstall` actions as needed. Use
   the SDK's hook helpers where they fit, and build on `computeSessionStartHookUpdate` where a
   bundled CLI needs more. The user/project command distinction (absolute vs
   `${CLAUDE_PROJECT_DIR}`) is the subtle part — see `references/session-hooks.md`.

8. **Split home from dashboard (if your live data is expensive).** A cheap, offline-safe `home`
   for the every-session user-scope hook; a richer `dashboard` (live state) for on-demand or
   project-scoped use. A tool whose live state is small and cheap can keep it in `home`. See `references/home-vs-dashboard.md`.

9. **Gate drift in CI.** A `check.yml` that runs `type-check` and `bun run check` (both
   `--check` builds) with `fetch-depth: 0` so `git describe` is stable. Template:
   `references/templates/check.yml`.

## Hard-won gotchas (the ones that cost hours)

These are distilled from building specops and claude-assist (and other internal AXI tools), and are enumerated
upstream in [kunchenguid/axi#46](https://github.com/kunchenguid/axi/issues/46). Internalize them
before you start — most are invisible until they bite.

- **A `.mjs`-named bundle never auto-installs hooks.** The SDK infers auto-install from the bin
  filename and silently no-ops on any filename containing a `.`. So you *don't* pass
  `hooks: false` (it isn't even in the published `AxiCliOptions` type in 0.1.7) — you manage hooks
  explicitly via your `setup hooks` command and rely on this implicit no-op.
- **`runAxiCli` rejects flags before the command.** `mytool --dir x` fails ("Flags must come
  after the command"). The no-args home view is therefore strictly zero-arg — it can't take a
  leading `--dir`. Lean on the SessionStart working directory instead, or register an explicit
  `home` command for the flag-bearing form.
- **The bundle is not on PATH.** Always emit resolved paths via `cliInvocation()`.
- **Version drift would fail `--check` forever.** Committing the bundle changes the git sha (and
  CI may lack tags), so the embedded `git describe` version always differs. Normalize the version
  literal out of *both* sides before comparing — covered in `references/build-pipeline.md`.
- **`Write` doesn't set +x.** The shim and `.mjs` must be committed executable (`chmod 755`).
- **Hook tests can write to your real settings.** Point `HOME` at a temp directory, and assert
  once that the installer resolved the temp path before trusting it: if the redirect doesn't
  apply in your runtime, the test edits your real `~/.claude/settings.json`. See
  `references/session-hooks.md`.
- **A hook installer that warns and exits 0 is a bug.** Treat any write error as a failure, and
  re-read status after installing. See `references/session-hooks.md`.
- **Mark the bundle `linguist-generated`** in `.gitattributes` so the giant generated `.mjs`
  collapses in PR diffs.

## Templates

`references/templates/` holds adaptable starting points — copy, then rename `mytool`/`MyTool`
to your CLI:

- `build-cli.ts` — esbuild bundle + version stamp + `--check` drift gate
- `build-skill.ts` — SKILL.md region splicer (single- and multi-skill `TARGETS` forms)
- `invocation.ts` — `cliInvocation()` resolved-path helper
- `skill.ts` — `spliceGeneratedRegions()` marker engine + `COMMAND_GROUPS` → markdown
- `shim` — the three-line bash shim
- `gitattributes` — the `linguist-generated` line
- `check.yml` — the CI drift gate
