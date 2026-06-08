# SpecOps

A Claude Code skill for **spec-driven development**: specs are the source of truth that declare the complete desired state of the software, paired with a lightweight **plan protocol** for tracking work-in-flight as a micro-DAG.

Specs lead; code follows. Every chunk of work starts with a spec update, gets a plan declaring scope/dependencies/validation, and closes out by bringing the running software into conformance with the spec.

Why specs and not docs: an implementer — human or agent — makes hundreds of micro-decisions, and the spec is what makes them match intent rather than guesswork. So a specops spec carries its own ***why*** — decisive governing **principles**, written down as first-class spec content and referenced *down* into the rules they govern, so the cases no rule enumerated get resolved the way the author would. And **spec↔code drift is a bug, not debt**: when the two diverge the spec is the authority until a review says otherwise, and a drift auditor keeps them honest.

## Install

```bash
npx skills add JarvusInnovations/specops            # into the current project (recommended)
npx skills add JarvusInnovations/specops --global   # once, at the user level
```

**Install per-project and commit it.** A project-level install drops the skill into the repo, so the methodology travels with the codebase and every contributor — and every agent they run — works against the same spec-and-plan practices. Installing globally only configures *your* machine; teammates wouldn't get it. Reach for `--global` for solo use or to try specops out across repos.

The skill lives under [`skills/specops/`](skills/specops/) — `SKILL.md` plus its `references/` and the bundled `specops` CLI under `scripts/`. **That subtree is all that installs into your project**; the rest of this repo (`src/cli/`, build scripts, tests, this README) only builds and maintains it.

## Set up specops in your project

You don't wire specops up by hand. Once the skill is installed, point the agent at your project with a single holistic prompt — it works for a new or existing codebase:

```
/specops set this project up for spec-driven development: scaffold specs/ and plans/,
seed principles.md and architecture.md from what we already know, wire up the
spec-drift auditor, and install the project-level plans dashboard session hook.
(For an existing codebase, reverse-engineer the starting specs from the current code.)
```

The agent follows the skill's setup flow — see [`SKILL.md`](skills/specops/SKILL.md) for the full checklist.

### The plans dashboard session hook

Part of that setup is a **SessionStart hook** so every agent session in the repo opens with the plans dashboard — ready / blocked / recently completed — letting an agent (or person) see the state of the work-in-flight DAG from turn one, without running anything.

It's **project-scoped**: written to the repo's `.claude/settings.json`, it fires only for sessions in that repo and reads that repo's `plans/`. Commit that file and every contributor's sessions open with the same dashboard — the same share-with-the-team logic as installing the skill per-project. (A global variant that fires for every session on your machine exists too, but the project hook is what keeps a team in sync.)

## Core loop

```
1. Spec change  →  propose what should be true
2. Accept       →  reviewer agrees on desired state
3. Implement    →  bring code into conformance
4. Verify       →  compare running software to spec
```

See [`SKILL.md`](skills/specops/SKILL.md) for the full methodology, and `skills/specops/references/plans-protocol.md` for the plan protocol that bridges specs to merged code.

## How specops differs

specops makes one opinionated bet: **a spec declares the complete desired state and stays authoritative for the life of the system, while a separate, temporal plan micro-DAG tracks the motion from spec to merged code and freezes as historical record once merged.** Most tools collapse these two layers — treating the spec as a scaffold consumed to generate code, or keeping only the temporal plan — and most leave governing principles and spec↔code drift to commit messages and review. The chart below maps where a representative handful of tools sit on the axes specops cares about; it's an honest map of the design space, not a scoreboard — several tools are stronger than specops on individual axes (notably BDD on drift enforcement, and Spec Kit and Kiro on agent/IDE integration).

| Philosophical axis | **specops** | [Spec Kit][sk] | [Kiro][kiro] | [OpenSpec][os] | [BMAD][bmad] | [BDD / Gherkin][bdd] | [ADRs][adr] |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Spec leads, or spec is a scaffold?** | Leads; stays authoritative for the system's life | Generates code; "living" in theory, forward-pipeline in practice | Launchpad; not enforced after the first build | Leads; canonical source of truth | Scaffold; code becomes truth, docs archived | Leads — executable contract code must satisfy | Neither — a log of *why*, not a spec of *what* |
| **Timeless spec vs. temporal motion** | Hard split: specs frozen by review, plan freezes on merge | Tiered (spec/plan/tasks) but per-feature, no freeze-as-record | Conflated — tasks live in the same folder, no archive | Split: canonical specs + changes archived on merge (no dependency DAG) | Collapsed into one corpus, then discarded | Timeless only; no plan/work layer | Immutable point-in-time records; truth is the chain |
| **Principles / "why" as first-class** | Decisive `principles.md`, referenced *down* into each spec | Yes — binding "constitution" | Yes — durable steering files | Yes — `project.md` conventions | Yes — `project-context.md` | No — concrete scenarios only | The original home for *why*, but frozen as a log |
| **Drift as a bug** | Yes — dedicated spec-drift auditor agent | Partial — manual consistency gates | Weak — manual reconcile on request | Weak — structural validation only | Reframed as context-collapse; epic sharding | Strongest — divergence fails the build | None — silent staleness |
| **Tooling weight** | Zero-dep drop-in skill (markdown + `node` CLI) | CLI install + project scaffold | Heaviest — VS Code fork + account + credits | npm CLI + scaffold; mature/packaged | Heaviest framework — personas, workflows, packs | Framework + maintained step-definition glue | Lightest — just markdown files |
| **Built for many agents on one shared spec** | Yes — micro-decisions against one persistent spec | Mostly linear single-agent pipeline | Gated single spec; parallel *execution* fan-out | Parallel changes via folder isolation | Multi-agent role *relay* with handoffs | Human "three amigos"; predates agents | Humans documenting for future humans |

[sk]: https://github.com/github/spec-kit
[kiro]: https://kiro.dev/docs/specs/
[os]: https://github.com/Fission-AI/OpenSpec
[bmad]: https://github.com/bmad-code-org/BMAD-METHOD
[bdd]: https://cucumber.io/docs/bdd/
[adr]: https://martinfowler.com/bliki/ArchitectureDecisionRecord.html

The work-tracking tools — agent **plan mode** (Claude Code, Cursor), **[Task Master][tm]**, and **[beads][beads]** — are left out of the chart on purpose: they have no desired-state spec layer, so the honest comparison is against specops' *plans* protocol, not its specs. All three live entirely in specops' temporal half (beads' git-native dependency graph is the closest prior art to the plans micro-DAG, and arguably more sophisticated on the pure work-graph axis). The full reasoning, per-tool stances, and sources are in [`docs/spec-driven-landscape.md`](docs/spec-driven-landscape.md).

[tm]: https://github.com/eyaltoledano/claude-task-master
[beads]: https://github.com/steveyegge/beads

## The `specops` CLI

A thin **determinism layer** over the files-first `plans/` workflow: it computes readiness, ordering, the dependency graph, and hygiene warnings *across all plan files* — work an agent can't reliably do by eye — and emits compact [TOON](https://toonformat.dev/). It runs on `node ≥ 20` with no `npm install` (deps are inlined into the committed bundle), so it works the moment the skill is installed.

```bash
skills/specops/scripts/specops                    # dashboard: ready / blocked / recently completed in ./plans
skills/specops/scripts/specops next               # full readiness breakdown (ready / awaiting / blocked)
skills/specops/scripts/specops next --slugs-only  # ready slugs, one per line (scripting)
skills/specops/scripts/specops dag --fence        # Mermaid graph of the DAG
```

To read or edit a single plan, open its file — the CLI deliberately has no `view` command.

### Developing the CLI

```bash
bun install
bun run build        # rebuild skills/specops/scripts/specops.mjs + splice its SKILL.md command reference
bun run check        # CI gate: fail if the committed bundle or SKILL.md is stale
bun run type-check
```

The bundle is committed and marked `linguist-generated`; commit it together with any `src/cli/` change (`bun run check` enforces this).

## What's inside

Everything under `skills/specops/` installs into a project; the rest is repo-only build and reference material.

| Path | What it is |
| --- | --- |
| [`skills/specops/SKILL.md`](skills/specops/SKILL.md) | The skill itself — philosophy, how to write specs (including encoding principles), the spec directory structure, and how agents use specs. |
| [`skills/specops/references/plans-protocol.md`](skills/specops/references/plans-protocol.md) | The full plan protocol: frontmatter schema, body template, status lifecycle, the closeout-commit ritual, and the Follow-ups taxonomy. |
| [`skills/specops/references/spec-drift-auditor.md`](skills/specops/references/spec-drift-auditor.md) | Agent definition (for `.claude/agents/`) that audits `specs/` against the implementation. |
| [`skills/specops/references/audit-spec-drift.md`](skills/specops/references/audit-spec-drift.md) | Slash-command definition (for `.claude/commands/`) that launches the auditor. |
| [`skills/specops/scripts/specops`](skills/specops/scripts/specops) | The `specops` CLI — a self-contained, committed bundle (`specops.mjs`) that queries the plans DAG. |
| [`src/cli/`](src/cli/) | TypeScript source for the CLI; `bun run build` bundles it into `skills/specops/scripts/specops.mjs`. *Repo-only — not installed.* |
| [`docs/spec-driven-landscape.md`](docs/spec-driven-landscape.md) | The research note behind [How specops differs](#how-specops-differs): per-tool stances and sources across the spec-driven landscape. *Repo-only — not installed.* |
