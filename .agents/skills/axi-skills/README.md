# axi-skills

A skill that teaches your coding agent how to **bake an [AXI](https://github.com/kunchenguid/axi)
CLI into a Claude Code skill** — bundling an `axi-sdk-js` tool inside a skill's `scripts/` and
shipping it as a self-contained, committed `.mjs` that installs with `npx skills add` and runs with
no `npm install`.

It's the *packaging-and-distribution* companion to the upstream `axi` skill: `axi` covers **what**
a good agent-facing CLI prints (TOON output, minimal schemas, content-first views); `axi-skills`
covers **how** to build and ship that CLI as a skill.

## When you'd want it

Reach for this skill when you're building an agent CLI and the tool **doesn't make sense as a
standalone npm install** — for example:

- **The tool only works alongside a skill** that supplies its broader workflow or usage protocol
  (e.g. a determinism helper over a files-first methodology).
- **A skill needs helper scripts** and you want them to benefit from AXI ergonomics (TOON,
  structured errors, a session-start banner) instead of hand-rolling plain scripts.
- **You want private distribution** — `npx skills add <owner>/<private-repo>` is a cleaner channel
  than publishing to npm.

If your tool *is* a general-purpose, public, standalone CLI, you probably want to publish it to npm
instead — this skill explains that trade-off too.

## What it gives the agent

A complete recipe plus copy-ready templates for the parts every implementation otherwise
hand-rolls:

- the esbuild → committed `.mjs` build, version stamping, and a CI drift gate
- the bash shim and off-PATH invocation resolution
- SessionStart hooks through `setup hooks`, at **user and project** scope (including the portable
  project-scoped command a vendored bundle needs)
- generating `SKILL.md` from a single-source command reference (splice a region *or* generate the
  whole file)
- splitting a lean every-session "home" view from a richer on-demand "dashboard"

## Install

**Recommended scope: per-project.** Install it in the repo that ships the bundled CLI. Building,
rebuilding and gating that bundle is ongoing work there, so the recipe should be version-controlled
with the code, and an update to the skill should arrive as a diff the team can read.

```bash
npx skills add JarvusInnovations/agent-skills --skill axi-skills
```

Then just start building an AXI tool inside a skill — the agent will load `axi-skills` when the
task calls for it. Read `SKILL.md` for the full recipe and `references/` for the deep dives.
