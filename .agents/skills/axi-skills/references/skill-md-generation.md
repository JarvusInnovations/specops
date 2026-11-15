# Generating SKILL.md from a single source of truth

A skill's `SKILL.md` documents the CLI's commands. If you write that by hand, it drifts from the
implementation the moment you add a flag. The fix: derive the command-reference *region* of
SKILL.md from the same data structure the CLI itself uses, and gate drift in CI. This is item #5
in [kunchenguid/axi#46](https://github.com/kunchenguid/axi/issues/46).

Templates: `references/templates/skill.ts`, `references/templates/build-skill.ts`.

## The single source: `reference.ts`

One module exports the CLI's identity and command catalog. Everything else derives from it:

```ts
export const DESCRIPTION = "Query … for the current repo — what's ready, what's blocked, …";

export interface CommandRef { usage: string; summary: string; }
export interface CommandGroup { group: string; commands: CommandRef[]; }

export const COMMAND_GROUPS: CommandGroup[] = [
  { group: "Plans", commands: [
    { usage: "next [--include-in-progress] [--dir <path>]", summary: "Plans ordered by readiness…" },
    { usage: "dag [--direction TB|LR] [--fence] [--dir <path>]", summary: "Mermaid graph of the DAG…" },
  ]},
  { group: "Session", commands: [
    { usage: "setup hooks [status|uninstall] [--scope user|project]", summary: "Manage the SessionStart hook…" },
  ]},
];
```

`COMMAND_GROUPS` feeds **three** consumers, so they can never disagree:

1. the home view's `help[]` / command listing,
2. the `--help` top-level reference,
3. the generated SKILL.md command-reference region (below).

## Two strategies: splice a region vs generate the whole file

There are two ways to keep SKILL.md in sync with the CLI. Pick by how much of the doc is genuine
hand-authored prose:

- **Splice a region** (covered below) — SKILL.md is mostly hand-authored methodology, and only a
  command-reference *region* is machine-maintained between markers. Use when the skill teaches a
  *workflow* the CLI supports (e.g. specops' spec-driven methodology) — most of the value is in
  prose the generator shouldn't touch.
- **Generate the whole file** — `build-skill.ts` emits the *entire* SKILL.md (frontmatter + body)
  from the home output, with no hand-authored body at all. Use when the skill body essentially
  *is* the command surface and usage rules — there's nothing to hand-author, so generating
  everything gives the strongest anti-drift guarantee (nothing *can* drift because nothing is
  hand-written). This is the model the public [lavish-axi](https://github.com/kunchenguid/lavish-axi)
  skill uses: `createSkillMarkdown()` renders frontmatter + body from the same object the no-args
  home view prints.

The mechanics below (single-source `reference.ts`, the `--check` gate) are identical either way —
only the splice step differs. If you generate the whole file, your generator returns the complete
document (see "Generating the whole file" near the end) instead of replacing marked spans.

## Marker-splice (region strategy)

SKILL.md is mostly hand-authored prose (methodology, philosophy, when-to-use). Only the
machine-maintained regions live between markers; everything outside is never touched:

```md
## Commands

<!-- BEGIN GENERATED: command-reference -->

### Plans

- `scripts/mytool next …` — Plans ordered by readiness…

<!-- END GENERATED: command-reference -->
```

The splicer replaces only the marked span. Inside SKILL.md, examples use the **relative**
`scripts/mytool` form (the skill's working context is its own directory) — not `cliInvocation()`,
which is for runtime-emitted output.

```ts
const SKILL_INVOCATION = "scripts/mytool";

export function commandReferenceMarkdown(): string {
  return COMMAND_GROUPS.map((g) => {
    const items = g.commands
      .map((c) => `- \`${SKILL_INVOCATION} ${c.usage}\` — ${c.summary}`)
      .join("\n");
    return `### ${g.group}\n\n${items}`;
  }).join("\n\n");
}

export const GENERATED_REGIONS: Record<string, () => string> = {
  "command-reference": commandReferenceMarkdown,
};
```

`spliceGeneratedRegions(doc)` loops the regions, regex-replaces between each `BEGIN/END GENERATED:
<id>` pair, and **throws if a declared region's markers are missing** — so a typo'd marker fails
loudly instead of silently leaving the doc stale. Full implementation in
`references/templates/skill.ts`.

## More than one region

You can splice several regions from different sources — useful when prose elsewhere in SKILL.md
duplicates a constant. A richer tool might generate several: `command-reference` (from
`COMMAND_GROUPS`), plus `entity-types` (introspected from zod schemas / type tables) and a
`philosophy` region (from a string constant a `playbook`-style command also emits). The rule:
**if a fact appears in both SKILL.md prose and code, make it a generated region** so it can't
drift.

Tip: keep generated content in `.ts` string constants rather than separate `.md` files loaded at
build time — a `.md`-loader path hit a bun/esbuild divergence in practice, and a string constant
just works for both the CLI surface and the splice.

## `build-skill.ts`

Reads each SKILL.md, runs the splicer, and either rewrites it or — with `--check` — fails if it
would change:

```ts
const out = spliceGeneratedRegions(readFileSync(PATH, "utf8"));
if (check && src !== out) { console.error("SKILL.md is out of date — run `bun run build:skill`"); process.exit(1); }
```

For a **multi-skill repo**, use a `TARGETS: {path, splice}[]` array — each skill's SKILL.md paired
with its splice function. One source module can export multiple splicers (e.g. a `makeSplicer(regions)`
factory bound to different `COMMAND_GROUPS` + invocation strings).

## Generating the whole file (whole-file strategy)

If there's no hand-authored body to preserve, skip markers entirely and have a `createSkillMarkdown()`
return the complete document — frontmatter and all — from the home output. `build-skill.ts` then
just compares the committed file to `createSkillMarkdown()` (`--check`) or overwrites it:

```ts
import { createSkillMarkdown } from "../src/cli/skill.js";
const expected = createSkillMarkdown();
const actual = await readFile(target, "utf8").catch(() => null);
if (check && actual !== expected) {
  console.error("SKILL.md is out of date — run `node scripts/build-skill.js` and commit it");
  process.exit(1);
}
```

`createSkillMarkdown()` builds the body from the same object the no-args home view prints (commands,
help, any playbooks), and emits the frontmatter (see "Frontmatter & discovery metadata" below).
Two things to handle because the *whole* file is generated:

- **Rewrite invocation for the skill context.** The home view emits the resolved runtime path via
  `cliInvocation()`; in the generated skill, rewrite command examples to the form an installed
  skill should run — `scripts/mytool …` for a committed bundle (this pattern), or `npx -y mytool …`
  if the tool is npm-distributed. lavish does the latter with a one-line `replaceAll`.
- **Omit live state.** Pass an `includeSessions: false`-style flag so the generated skill carries
  the static command surface, not the live dashboard rows the SessionStart hook shows.

## Frontmatter & discovery metadata

`name` and `description` are the only required frontmatter, but the generated SKILL.md can carry
more to help agents and skill registries surface it well. The public lavish-axi skill is a good
reference for the emerging conventions:

```yaml
---
name: mytool
description: <trigger-shaped: what it does AND when to reach for it>
argument-hint: <what to pass when invoked as /mytool>   # enables slash-command use
author: Your Name (handle)
metadata:
  hermes:                       # Hermes Agent discovery
    tags: [domain, keywords]
    category: productivity
  internal: true                # hide from discovery — for repo-internal skills only
user-invocable: true            # allow explicit /mytool invocation
---
```

- **`argument-hint` + a `$ARGUMENTS` section** let the same skill auto-trigger *or* be invoked
  explicitly as `/mytool <arg>` — the body branches on whether `$ARGUMENTS` is empty.
- **`metadata.hermes`** (tags/category) lets Hermes-compatible harnesses categorize and surface
  the skill; harmless elsewhere.
- **`metadata.internal: true`** marks a skill as repo-internal so discovery tooling can hide it —
  useful when a repo ships internal helper skills alongside the public one.

### Gotcha: don't emit a `version` field

If an external release tool (release-please, semantic-release) bumps `package.json` *without*
regenerating SKILL.md, a generated `version:` field goes stale on every release commit and the
`--check` gate flaps. Leave `version` out of the generated frontmatter — the bundle's own
`--version` (from `git describe`) is the honest source of version truth.

## Tie it into CI

The combined `check` script runs both gates:

```json
{ "scripts": {
  "build": "bun scripts/build-cli.ts && bun scripts/build-skill.ts",
  "check": "bun scripts/build-cli.ts --check && bun scripts/build-skill.ts --check"
}}
```

CI runs `bun run check`, so a PR that changes `src/cli/` without rebuilding — or edits the
generated SKILL.md region by hand — fails. See `references/templates/check.yml`.
