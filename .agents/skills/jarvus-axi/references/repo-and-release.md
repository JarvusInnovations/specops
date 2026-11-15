# Repo, tests and release: the npm recipe

`axi-skills` covers a CLI that ships inside a skill as a committed bundle. Most of our tools
ship the other way, as a public npm package with a small companion skill. This is that recipe.

## Contents

- [Which distribution](#which-distribution)
- [Layout](#layout)
- [`reference.ts` and the generated skill](#referencets-and-the-generated-skill)
- [Specs and plans](#specs-and-plans)
- [Tests](#tests)
- [CI](#ci)
- [Toolchain](#toolchain)
- [Versioning and publishing](#versioning-and-publishing)
- [Public repo hygiene](#public-repo-hygiene)
- [README](#readme)

## Which distribution

| Ship as | When |
| --- | --- |
| **npm package** (default) | A general-purpose public CLI. Agents run it from `PATH` or with `npx -y`. |
| **Skill bundle** (`axi-skills`) | The tool only makes sense alongside a skill, or needs private distribution. |
| **Both** | The tool is general-purpose *and* must work with no install step, offline or on a cold start. Rare; it doubles the release work. |

Name the package and binary `<service>-axi`. The catalog reads names that way, so a name that
matches an unrelated product reads as a wrapper for it.

## Layout

```
bin/<tool>.ts            # entrypoint: --version fast path, then import the CLI
src/
  cli.ts                 # runAxiCli wiring, formatError, command table
  flags.ts               # the strict parser and every command's FlagSpec
  reference.ts           # DESCRIPTION, COMMAND_GROUPS: single source for help and the skill
  version.ts             # leaf module; imports nothing heavy
  config.ts              # config dir, accounts, modes
  commands/<name>.ts     # one thin file per command: parse, call, render
  <service>/             # API client, pagination, error translation
  output/                # schema + render; the only place that imports the TOON encoder
  time/                  # range and timezone handling, when the tool has dates
scripts/generate-skill.ts
skills/<tool>/SKILL.md   # generated
specs/                   # principles, architecture, behaviors/, commands/, api/
plans/
test/
```

- `main(argv, io)` takes its clock, working directory, environment and stdout as arguments, so
  tests inject them.
- `bin/` answers `--version` through the SDK's `axi-sdk-js/fast-path` before importing the
  command graph (upstream principle 10). Several older tools don't; new ones should.
- Use Node APIs only at runtime, even though development uses bun. A bun-only global breaks the
  published package under node.

## `reference.ts` and the generated skill

One module holds the tool's description and every command's usage, summary, flags and
examples. Three things are generated from it:

- top-level and per-command `--help`
- the home view's hints
- `skills/<tool>/SKILL.md`

Hand-written help drifts. One tool changed where its exports were written, and its help text
kept naming the old location until someone read it.

For the skill:

- `scripts/generate-skill.ts` writes the whole file, or splices a marked region into
  hand-written prose when the skill carries procedures.
- Every example is rewritten to `npx -y <tool> …`, so the skill works with nothing installed.
- The frontmatter description is trigger-shaped: what the user would say, not what the tool is.
- `package.json` scripts `docs` and `docs:check`; CI runs `docs:check` and fails on drift.
- `skills/<tool>` is listed in `package.json` `files`, so it ships in the package.
- Hand-written sections refer to commands by name and never restate their flags.
- `references/` in the skill holds procedures an agent enters from a symptom ("my notes are
  gone"), not from a command name.
- Nothing about operating the tool may depend on the skill being installed. The CLI's own help
  and hints must be enough.

## Specs and plans

We build spec-first with [specops](https://github.com/JarvusInnovations/specops). Specs lead;
drift between a spec and the code is a bug in one of them.

```
specs/
  principles.md        # decisive rules: each picks a side of a trade-off
  architecture.md
  behaviors/           # cross-command contracts: time, accounts, errors, export
  commands/            # one per command or group
  api/                 # what we rely on from the upstream
plans/                 # a DAG of work items with frontmatter
```

- A principle is a `##` heading with a rule and a `> **Why:**` line (or `> Prevents:`). If it
  doesn't rule something out, it isn't a principle.
- Every spec ends with `## Principles`, split into **Inherited** (links to `principles.md`)
  and **Local**.
- Record what you rely on from the upstream in a table that marks each fact *Observed (date)*,
  *Documented* or *Cannot be observed here*. Reverse-engineered behavior needs this most.
- Plans carry frontmatter (`status`, `depends`, `specs`, `issues`, `pr`) and sections for
  scope, approach, validation checkboxes, risks and notes. A plan freezes when its PR merges.

The commit rhythm:

1. `docs(specs): …`
2. `chore(plans): mark <plan> in-progress`
3. `feat: …` or `fix: …`
4. `test: …`
5. `chore(plans): mark <plan> done (PR #N)`

For review findings, write the failing tests first:

1. `docs(specs): review rulings for <plan>`
2. `test: failing-first tests for the <plan> review findings`
3. the fixes

A fix plan's validation line reads "all N new tests fail against the previous source and pass
with the fix". That is what makes a fail-closed fix believable.

A spec change may go in its own PR ahead of the code when it reverses an earlier decision.

## Tests

Tests live in `test/`, mirroring `src/`, on vitest.

**Hermetic by construction:**

- Config, cache and state go to `mkdtemp` directories through the XDG variables. Replace `HOME`
  too: the SDK writes a Codex config under the home directory at any scope.
- `<TOOL>_AXI_DISABLE_HOOKS=1` is set globally.
- The clock, working directory and environment are injected through `main(argv, io)`.
- Network is blocked. Either stub `fetch` with a router that throws
  `unrouted fetch in test: <url>` for anything unexpected, or load a preload module that
  patches the network modules and reports attempts.
- A daemon-backed CLI tests against a fake daemon on a real socket, plus one end-to-end test
  with the real binary.

**Tests the conventions need:**

- The flag sweep, the declarations-versus-help comparison and the hint runner (`flags.md`).
- Stdout is byte-identical with and without an export flag, and the printed `jq` example runs
  (`machine-output.md`).
- Every failed read produces an error and never an empty success (`fail-closed.md`).
- `formatError` maps usage codes to exit 2 and wraps unexpected errors.
- Home's performance budget, in a serial project so load doesn't make it flaky.
- A read-only tool asserts it never writes to its sources.
- A product boundary has a test (`mutations.md`).

**Live tests** are gated behind an environment variable, clean up after themselves, and never
run in CI. Record a live verification in the plan notes. A check that needs a real, costly
mutation is left to the maintainer and marked as such.

## CI

On push and pull request to `main` and `develop`:

1. frozen-lockfile install
2. lint and format check (where the repo has them)
3. typecheck
4. build
5. test
6. `docs:check`
7. **The no-credentials smoke test.** Run a real command on the built binary with no
   credentials. Assert a structured error with the expected `code:` and exit status, and fail
   if a stack trace appears (`^\s+at` or `node:internal`). `--version` and `--help` never
   reach dispatch, so a smoke test of only those stayed green while every command was broken.
8. the privacy scrub (below)

In shell steps, a bare `grep` under `set -e` aborts on no match. Use `if ! grep …`.

Also run CI on the pull request `edited` event, so a stacked PR that gets retargeted is
checked against its new base.

For pre-merge gate setup generally, see the `jarvus-ci` skill.

## Toolchain

- bun for install, dev and running tests; `tsc` to `dist/` for the published build. Bundle with
  esbuild only when a dependency forces it.
- Node and bun pinned in `.tool-versions` (asdf).
- `engines.node` is the floor you have actually verified, currently `>=22`.
- TypeScript strict, ES modules, Node16 resolution.
- oxlint and oxfmt are recommended; `tsc` alone is acceptable in a small tool.
- MIT license. The `repository` field must be set, or a provenance publish is rejected.

## Versioning and publishing

Releases use the develop→main Release-PR flow. Use the `jarvus-release-flow` skill to cut one and
`repo-setup` to wire a new repo. What is specific to AXI tools:

- **The tag is the version.** `package.json` keeps a placeholder (`0.1.0` or `0.0.0`) in git.
  The publish workflow stamps it:

  ```
  npm version --no-git-tag-version --allow-same-version "${RELEASE_TAG#v}"
  ```

- **Trusted publishing.** `publish-npm.yml` runs on `release: published` with
  `id-token: write`, on Node 24 (npm 11 is needed), then
  `npm publish --provenance --access public`. No npm token is stored.
- **The first publish is manual.** Trusted publishing needs the package to exist, so the first
  version has no provenance. Configure trusted publishing immediately after, and make the
  workflow skip a version already on the registry with a warning.
- `--version` prints a bare semver. A dev build may print `0.0.0-dev`.
- Pre-releases (`-rc.N`) publish under the `next` dist-tag.
- Check the `npm pack` file list before the first publish.
- **If the repo also ships a committed skill bundle:**
  - make `main` the default branch, because `npx skills add` installs from the default branch
    and users should get releases, not every merge
  - add guard workflows that keep stray PRs off `main`
  - stamp the bundle with the release version in its own commit on `develop` before merging
    the Release PR
  - have a validation job check the stamp
- **Platform binaries** (a compiled daemon) ship as per-platform packages listed in
  `optionalDependencies` with `os` and `cpu` fields, and no postinstall script. Their first
  publishes are manual too. Check the license of anything compiled in.

For a catalog submission, the tag commit must equal the `gitHead` npm reports
(`catalog-admission.md`).

## Public repo hygiene

Our AXI repos are public. Put this at the top of the repo's agent instructions, and enforce it.

- No client or tenant names, real hostnames, account ids, emails, home-directory paths or
  session ids in code, tests, fixtures, specs, plans, commit messages or PR text.
- Use placeholders: `acme`, `member@example.com`, `metabase.example.org`, `/home/user`.
- Generate fixtures from a script; don't capture them from a real account.
- Add a scrub gate that fails CI on real-looking home paths, email addresses outside the
  reserved example domains, and non-synthetic ids. Give it a test that plants each marker and
  confirms the gate catches it.
- For a tool that handles private content, add a test that the content never reaches logs.

## README

- What the tool is for, in the user's terms, and what it deliberately doesn't do.
- Install, then the first command.
- The session hook and the skill as alternatives ("pick one"), each optional.
- The command table, generated or checked against `reference.ts`.
- Update the status line when the tool becomes usable. A README that still says "nothing here
  works yet" at release is a review finding.
