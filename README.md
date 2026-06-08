# SpecOps

A Claude Code skill for **spec-driven development**: specs are the source of truth that declare the complete desired state of the software, paired with a lightweight **plan protocol** for tracking work-in-flight as a micro-DAG.

Specs lead; code follows. Every chunk of work starts with a spec update, gets a plan declaring scope/dependencies/validation, and closes out by bringing the running software into conformance with the spec.

Why specs and not docs: an implementer — human or agent — makes hundreds of micro-decisions, and the spec is what makes them match intent rather than guesswork. So a specops spec carries its own ***why*** — decisive governing **principles**, written down as first-class spec content and referenced *down* into the rules they govern, so the cases no rule enumerated get resolved the way the author would. And **spec↔code drift is a bug, not debt**: when the two diverge the spec is the authority until a review says otherwise, and a drift auditor keeps them honest.

## Install

```bash
npx skills add JarvusInnovations/specops
```

This repo *is* the skill — `SKILL.md` lives at the root, with supporting material under `references/` and the bundled `specops` CLI under `scripts/`.

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

The work-tracking tools — agent **plan mode** (Claude Code, Cursor), **[Task Master][tm]**, and **[beads][beads]** — are left out of the chart on purpose: they have no desired-state spec layer, so the honest comparison is against specops' *plans* protocol, not its specs. All three live entirely in specops' temporal half (beads' git-native dependency graph is the closest prior art to the plans micro-DAG, and arguably more sophisticated on the pure work-graph axis). The full reasoning, per-tool stances, and sources are in [`references/spec-driven-landscape.md`](references/spec-driven-landscape.md).

[tm]: https://github.com/eyaltoledano/claude-task-master
[beads]: https://github.com/steveyegge/beads

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
scripts/specops                      # dashboard: ready / blocked / recently completed in ./plans
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
