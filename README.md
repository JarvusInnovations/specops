# SpecOps

A Claude Code skill for **spec-driven development**: specs are the source of truth that declare the complete desired state of the software, paired with a lightweight **plan protocol** for tracking work-in-flight as a micro-DAG.

Specs lead; code follows. Every chunk of work starts with a spec update, gets a plan declaring scope/dependencies/validation, and closes out by bringing the running software into conformance with the spec.

## Install

```bash
npx skills add JarvusInnovations/specops
```

This repo *is* the skill — `SKILL.md` lives at the root, with supporting material under `references/` and the bundled `specops` CLI under `scripts/`.

## What's inside

| Path | What it is |
| --- | --- |
| [`SKILL.md`](SKILL.md) | The skill itself — philosophy, how to write specs (including encoding principles), the spec directory structure, and how agents use specs. |
| [`references/plans-protocol.md`](references/plans-protocol.md) | The full plan protocol: frontmatter schema, body template, status lifecycle, the closeout-commit ritual, and the Follow-ups taxonomy. |
| [`references/spec-drift-auditor.md`](references/spec-drift-auditor.md) | Agent definition (for `.claude/agents/`) that audits `specs/` against the implementation. |
| [`references/audit-spec-drift.md`](references/audit-spec-drift.md) | Slash-command definition (for `.claude/commands/`) that launches the auditor. |
| [`scripts/specops`](scripts/specops) | The `specops` CLI — a self-contained, committed bundle (`scripts/specops.mjs`) that queries the plans DAG. Built from [`src/cli/`](src/cli/) with `bun run build`. |

## The `specops` CLI

A thin **determinism layer** over the files-first `plans/` workflow: it computes readiness, ordering, the dependency graph, and hygiene warnings *across all plan files* — work an agent can't reliably do by eye — and emits compact [TOON](https://toonformat.dev/). It runs on `node ≥ 20` with no `npm install` (deps are inlined into the committed bundle), so it works the moment the skill is installed.

```bash
scripts/specops                      # dashboard: what's ready / blocked in ./plans
scripts/specops next                 # full readiness breakdown (ready / awaiting / blocked)
scripts/specops next --slugs-only    # ready slugs, one per line (scripting)
scripts/specops dag --fence          # Mermaid graph of the DAG
scripts/specops hook install         # load the dashboard into every session of this repo
```

To read or edit a single plan, open its file — the CLI deliberately has no `view` command.

### Developing the CLI

```bash
bun install
bun run build        # rebuild scripts/specops.mjs + splice SKILL.md's command reference
bun run check        # CI gate: fail if the committed bundle or SKILL.md is stale
bun run type-check
```

The bundle is committed and marked `linguist-generated`; commit it together with any `src/cli/` change (`bun run check` enforces this).

## Core loop

```
1. Spec change  →  propose what should be true
2. Accept       →  reviewer agrees on desired state
3. Implement    →  bring code into conformance
4. Verify       →  compare running software to spec
```

See [`SKILL.md`](SKILL.md) for the full methodology, and `references/plans-protocol.md` for the plan protocol that bridges specs to merged code.
