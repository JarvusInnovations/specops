# The spec-driven landscape — how specops compares

A survey of the popular "spec-driven development" / spec-ops toolkits and the older
lineages they descend from, distilling how **specops** differs *philosophically* — not
feature-by-feature. This is the research backing for the comparison chart in the
[README](../README.md#how-specops-differs); the chart is the curated summary, this note
is the honest long form.

Researched against primary sources (project READMEs, official docs, maintainer posts) in
**early 2026**. The agentic-development space moves fast — treat dated specifics
(pricing, storage engines, command names) as point-in-time and re-confirm before relying
on them.

## The axes

Every tool below is read against the six axes specops cares about:

1. **Spec as desired-state vs. generated artifact** — does the spec *lead* the code and
   stay authoritative, or is it a scaffold/PRD consumed to generate code and then left
   behind?
2. **Timeless state vs. temporal motion** — is there a hard split between durable specs
   (what should always be true) and temporal plans/tasks (how we get there next)? Most
   tools collapse these.
3. **Principles / philosophy as first-class content** — is the *why* — governing,
   decisive principles — a maintained spec artifact, or does it live in commit messages
   and chat?
4. **Drift as a bug** — is spec↔code divergence treated as a defect to detect and
   reconcile, or is the spec disposable once code exists?
5. **Tooling weight** — zero-dep drop-in vs. installed framework / IDE coupling.
6. **Human+agent co-authorship** — designed for many agents making hundreds of
   micro-decisions against one shared spec, or a single linear flow?

## Where specops sits (the short version)

specops makes one opinionated bet: **a spec declares the complete desired state and stays
authoritative for the life of the system; a separate, temporal plan micro-DAG tracks the
motion from spec to merged code and freezes as historical record on merge.** Two layers,
hard split: `specs/` frozen by review, `plans/` frozen by merge. On top of that it treats
governing **principles** as first-class (a decisive `principles.md` referenced *down* into
individual specs, plus standing decision-capture vigilance) and treats **spec↔code drift
as a bug** (a dedicated drift-auditor agent). It ships as a zero-dependency Claude Code
skill — markdown plus a `node`-only CLI, no `npm install`.

No single tool below holds all of those bets at once. Several are **stronger than specops
on individual axes** — BDD enforces drift mechanically, Spec Kit and Kiro have far tighter
agent/IDE integration, beads has a more sophisticated work-graph, OpenSpec is a more
mature and broadly-integrated product. The goal here is an honest map of the design space,
not a scoreboard.

---

## Spec-driven development tools

### GitHub Spec Kit (`github/spec-kit`, `specify` CLI)

**Core stance:** the specification is the source from which code is *generated and
regenerated* through a structured, constitution-governed pipeline
(`constitution → specify → clarify → plan → tasks → implement`) — "code serves
specifications."

- **Desired-state vs. generated:** Aspirationally desired-state ("the PRD isn't a guide
  for implementation; it's the source that generates implementation"), and the philosophy
  doc claims specs are living and that requirement changes drive *regeneration*. In
  practice the dominant lifecycle is a forward pipeline that produces code, with the spec
  as a per-feature artifact you can revisit — the living-spec claim is stronger in the doc
  than in observed use.
- **Timeless vs. temporal:** Genuinely sophisticated tiering — **specifications**
  (durable intent), **plans** (temporal architecture, regenerated on stack/spec change),
  **tasks** (ephemeral, dependency-ordered with `[P]` parallel markers, discarded after).
  It deliberately separates the three, but per-feature and with no freeze-as-record step.
- **Principles:** Strong. A `constitution.md` (`.specify/memory/`) of binding, numbered
  articles (e.g. test-first declared "NON-NEGOTIABLE"), referenced through specify/plan/
  implement. Its best philosophical primitive.
- **Drift:** Partial. `/analyze` (cross-artifact consistency) and `/checklist` (manual
  gates) exist; drift is treated as solved-by-regeneration in theory, but there is no
  continuous automated spec↔code detector — enforcement is checkpoint-based and manual.
- **Weight:** Medium-heavy. Install the `specify` CLI (Python 3.11+ via `uv`/`pipx`),
  `specify init` scaffolds a `.specify/` tree, and per-agent command files install per
  integration (30+ agents supported).
- **Co-authorship:** Mostly a linear single-agent pipeline with human review gates;
  optional "generate multiple approaches" branching. Not bottom-up distributed
  deliberation.
- **Stronger than specops at:** polished scaffolding, pre-wired integration with 30+
  agents, `/clarify` + `/analyze` + `/checklist` gates, `/taskstoissues` GitHub bridge.

Sources: <https://github.com/github/spec-kit> · `spec-driven.md` in that repo ·
<https://developer.microsoft.com/blog/spec-driven-development-spec-kit>

### Amazon Kiro (`kiro.dev`)

**Core stance:** specs as a disciplined, gated *launchpad* — EARS requirements → design →
tasks, each behind a human approval gate — that front-loads rigor before code; not a
perpetually-enforced source of truth afterward.

- **Desired-state vs. generated:** Requirements-*first* but artifact-*generative*. A spec
  is a folder of `requirements.md` (EARS: "WHEN … THE SYSTEM SHALL …"), `design.md`, and
  `tasks.md`. Files persist and *can* serve as ongoing truth, but the docs neither assert
  nor enforce that they stay authoritative post-build.
- **Timeless vs. temporal:** Partially present but **conflated** — the temporal
  `tasks.md` lives in the *same folder* as durable requirements/design; tasks are marked
  done in place with no freeze/archive step.
- **Principles:** Strong. "Steering files" (`.kiro/steering/`) — `product.md`, `tech.md`,
  `structure.md` — capture durable project-wide context, with four inclusion modes
  (always/conditional/manual/auto). Adopted `AGENTS.md` and Agent Skills.
- **Drift:** Weakest axis. No automatic detection or continuous sync; the developer must
  recognize drift and ask Kiro to reconcile. `requirements.md` reliably drifts after a few
  days of iterative change.
- **Weight:** Heaviest of the IDEs — a full **VS Code fork** plus account and credit-based
  pricing (Free/Pro/Pro+/Power tiers). All-or-nothing; some VS Code extensions break.
- **Co-authorship:** Has an autonomous agent and parallel subagents (CLI runs several),
  and `tasks.md` groups independent tasks into concurrent "waves" — but that's execution
  fan-out against one human-gated spec, not distributed co-authorship of the source.
- **Stronger than specops at:** EARS-structured testable requirements, integrated
  requirements→design→tasks with approval gates, durable steering files, polished
  IDE/CLI/web UX.

Sources: <https://kiro.dev/docs/specs/> · <https://kiro.dev/docs/steering/> ·
<https://kiro.dev/autonomous-agent> · <https://kiro.dev/pricing/>

### OpenSpec (`Fission-AI/OpenSpec`, `openspec` CLI)

**Core stance — specops' nearest neighbor:** the spec is the durable source of truth and
every modification is an isolated, archivable *change proposal* whose deltas merge back
into the canonical spec.

- **Desired-state vs. generated:** Firmly spec-leads-code. Cleanly separates a *proposed
  change* from *current truth*: a change in `openspec/changes/<name>/` carries
  `proposal.md`, `design.md`, `tasks.md`, and a `specs/` subfolder of **delta specs**
  (`ADDED`/`MODIFIED`/`REMOVED`) against the canonical `openspec/specs/`. Lifecycle:
  propose → approve → apply → **archive**, where archiving *merges the deltas into the
  canonical spec*. This archive-and-merge flow is nearly identical to specops freezing a
  plan on merge while `specs/` remains the baseline.
- **Timeless vs. temporal:** Exact conceptual match — durable `specs/` vs. temporal
  `changes/` archived when done. **Divergence:** OpenSpec changes are independent parallel
  work items with *no documented cross-change dependency DAG*; `openspec status` exposes
  intra-change artifact readiness, not "what unblocks the most work next." specops' plans
  as a true dependency micro-DAG with a readiness CLI is genuinely distinct.
- **Principles:** Yes — `openspec/project.md` (project conventions/constraints, injected
  into generated artifacts) plus `AGENTS.md`. A real peer to `principles.md`, but
  conventions-leaning and injected broadly rather than *referenced down* into individual
  specs as decisive governance.
- **Drift:** Weak. `openspec validate` is structural (changes/specs well-formedness); no
  spec↔code drift detection or auditor stance.
- **Weight:** Medium, mature/packaged. `npm i -g @fission-ai/openspec`, `openspec init`
  scaffolds the tree and generates slash commands + `AGENTS.md`; broad integration
  ("20+ AI assistants"). A substantially more mature product than specops by adoption.
- **Co-authorship:** Isolated per-change folders let multiple proposals coexist without
  conflict — coordination via folder isolation, not a shared dependency graph.
- **Stronger than specops at:** maturity, breadth of agent integration, a real
  structured delta-spec format.

Sources: <https://github.com/Fission-AI/OpenSpec> ·
`docs/concepts.md`, `docs/cli.md` in that repo · <https://openspec.dev/>
(The `project.md`-as-"constitution" framing is corroborated by third-party guides rather
than verbatim OpenSpec docs — treat that wording as secondary.)

### BMAD-METHOD (`bmad-code-org/BMAD-METHOD`)

**Core stance:** planning documents (PRD, architecture, epics, stories) are *ephemeral
point-in-time ideation artifacts* that drive an elaborate sequential multi-agent assembly
line, after which the *codebase* becomes the source of truth.

- **Desired-state vs. generated:** Explicitly disposable. The maintainer's own framing:
  "PRD, Epics and stories are all meant to be ephemeral point in time documents" — a
  "snapshot in time of ideation … a TERRIBLE reference"; the guidance is to archive or
  delete them once stories complete. The spec leads only until code exists, then authority
  inverts to the codebase. Near-opposite of specops.
- **Timeless vs. temporal:** Does *not* separate the two — PRD + architecture + epics +
  stories are one planning corpus tied to a delivery phase, then discarded. The archived
  PRD is closer to a frozen *plan* than to a living spec.
- **Principles:** `project-context.md` — literally called "a constitution for your
  project" (stack, conventions, critical implementation rules), generated after
  architecture or reverse-engineered from code. The closest BMAD analog to
  `principles.md`, but positioned as operational anti-drift guidance, regenerated
  post-MVP, rather than decisive governance referenced down into specs.
- **Drift:** Reframed as a *context* problem ("context collapse" / "architectural
  drift"), mitigated by **epic sharding** (self-contained story files carrying full
  context) and `project-context.md`. No spec↔code reconcile —
  `bmad-document-project` regenerates docs from current code rather than flagging
  divergence.
- **Weight:** Heaviest framework surveyed — `npx bmad-method install` lays down config +
  output trees, registers per-IDE skills, and ships modules, expansion packs, web bundles,
  and a multi-layer config model.
- **Co-authorship:** Its signature strength — named personas (Analyst, PM, Architect, UX,
  Scrum Master, Dev, QA) run a sequential **relay with explicit handoffs**, each agent's
  output the next's input, plus a "Party Mode" for multi-persona sessions. This is a relay
  race of specialized roles; specops is many agents referencing one shared constitution
  concurrently.
- **Stronger than specops at:** the most elaborate agent-role orchestration, structured
  agile workflow, and story-by-story context engineering (the Scrum Master sharding
  hyper-detailed self-contained stories is a real innovation).

Sources: <https://github.com/bmad-code-org/BMAD-METHOD> · <https://docs.bmad-method.org/> ·
discussions [#57](https://github.com/bmad-code-org/BMAD-METHOD/discussions/57) and
[#1838](https://github.com/bmad-code-org/BMAD-METHOD/discussions/1838)

---

## Work-tracking tools (the *plans* layer, not the *spec* layer)

These have **no desired-state spec layer** — comparing them on "spec as desired-state"
would be a strawman. Their honest comparison is against specops' **plans protocol**: a
temporal work-graph. Each lives entirely in specops' *temporal* half.

### Agent plan mode (Claude Code, Cursor)

**Core stance:** a plan is a disposable, temporal scaffold for the next chunk of work —
approved, executed, and forgotten, leaving only the code behind.

- Temporal-only and **evaporative**: Claude Code plans live in `~/.claude/plans/` (outside
  the repo) and do not reliably survive context compaction; saving Cursor's plan to the
  repo is optional. Nothing freezes as record.
- No principles layer in the plan (those live in `CLAUDE.md` / `.cursor/rules`); no drift
  concept (once code is written the plan is gone).
- **Weight:** zero — free, built-in (Shift+Tab). Single-session, single-agent.
- **Stronger than specops at:** zero-friction scoping of a single task before code.

Contrast: specops plans are temporal *and* freeze on merge as historical record, beside a
separate timeless spec — plan mode keeps neither.

Sources: <https://cursor.com/blog/plan-mode> · Claude Code plan-persistence issues
[#17058](https://github.com/anthropics/claude-code/issues/17058),
[#29445](https://github.com/anthropics/claude-code/issues/29445)

### Task Master (`eyaltoledano/claude-task-master`)

**Core stance:** a PRD is a one-time input parsed into a tracked task graph
(`tasks.json` + per-task files under `.taskmaster/`) that drives generation — durable
while work is in flight, but the living artifact is the task DAG, not a maintained spec.

- Temporal-with-status: tasks persist and carry done/in-progress state; no separate
  timeless spec alongside. No principles artifact; no drift stance.
- **Weight:** installed framework (npm + MCP/CLI). Multi-agent-friendly via the shared
  `.taskmaster/` directory and dual MCP+CLI access.
- **Stronger than specops at:** task decomposition + dependency tracking + cross-editor
  portability with genuine status persistence.

Source: <https://github.com/eyaltoledano/claude-task-master>

### beads (`steveyegge/beads`, `bd` CLI)

**Core stance — closest prior art to specops' plans DAG:** queryable external *memory*
for coding agents — a git-/Dolt-backed dependency graph of *issues* that always knows
"what's ready to work on" across amnesiac sessions. Tracks work-in-motion, not desired
state.

- No spec layer; core unit is the *issue* ("bead", hash-ID like `bd-a1b2`). Entirely on
  the temporal side.
- **The work-graph is its home turf and arguably more sophisticated than specops' plans
  CLI:** typed links (`blocks`, `related`, `parent-child`, `discovered-from`), `bd ready`
  computes transitive blocking offline (~10ms), persistence has evolved from JSONL-in-git
  (Nov 2025) to **Dolt-backed** SQL with cell-level merge (JSONL now an export, not the
  source of truth). Hash IDs make concurrent multi-agent writes conflict-free; age-based
  compaction provides "memory decay."
- **Two philosophical differences from specops plans:** (a) beads issues never *freeze on
  merge* — they persist and decay rather than crystallizing into immutable history; and
  (b) beads is a self-contained, *terminal* work-graph — it does not *bridge* to a
  separate timeless spec the way specops plans reconcile against `specs/`. beads is a pure
  work-graph; specops plans are a work-graph that exists to update a desired-state layer.
- No principles layer (it has operational memory via `bd remember`, not normative
  principles); no drift concept (no spec to drift from).
- **Weight:** moderate — a CLI binary (installed once globally) + embedded Dolt engine +
  optional MCP server. Built ground-up for agent autonomy with human visibility.
- **Stronger than specops at:** the pure work-graph — real SQL queries, transitive
  readiness, git-native conflict-free multi-agent writes, memory decay.

Sources: <https://github.com/steveyegge/beads> ·
[Introducing Beads](https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a)

---

## The older lineages (prior art)

### BDD / Gherkin / executable specs (Cucumber, SpecFlow/Reqnroll, behave)

**Core stance:** the spec *is* the test — behavior pinned to plain-language examples that
fail the build the moment code drifts, but only for behaviors you can wire to executable
steps.

- **Desired-state vs. generated:** Genuinely spec-leads-code — `.feature` files are the
  durable, human-authored statement of desired behavior the code must satisfy; the test
  reports become "the single source of truth for system behavior."
- **Timeless vs. temporal:** Timeless only — scenarios assert what should *always* be
  true. No native plan/task/work-in-flight notion at all; work tracking lives entirely
  outside the artifact.
- **Principles:** Weakest axis — Gherkin captures concrete `Given/When/Then` scenarios,
  not governing principles or the *why*. No `principles.md` analog scenarios reference
  into.
- **Drift — the strongest mechanism of any approach surveyed:** step definitions hard-wire
  each Gherkin step to executable code, so divergence *mechanically fails CI*. Not
  detected-by-review — impossible-to-merge. **Cost:** every spec line needs
  step-definition glue; only covers what's *testable* (UX feel, architecture, the "why"
  are out of reach); brittle step defs; teams routinely degrade Gherkin into imperative UI
  scripts.
- **Weight:** Heavy — framework + parser + runners + a maintained layer of
  step-definition code in lockstep with the prose.
- **Co-authorship:** Not designed for AI agents — predates them by ~15 years (Dan North,
  2004–2006); the "three amigos" are human BA/dev/tester roles.
- **Stronger than specops at:** drift enforcement — mechanical build failure on divergence
  is unmatched.

Sources: <https://cucumber.io/docs/bdd/> · <https://dannorth.net/blog/introducing-bdd/>

### ADRs + RFC / design-doc cultures (Nygard ADR, MADR, Google design docs)

**Core stance:** capture the decision and its rationale at the moment it's made, then
freeze it — the value is an immutable audit trail of *why*, never a checked-against-code
description of what should be true *now*.

- **Desired-state vs. generated:** Neither — a *decision log*. Each record captures one
  decision + context + trade-offs at a point in time; tells you why the system is the way
  it is, not what it should be.
- **Timeless vs. temporal — sharp contrast with specops:** ADRs are explicitly
  **immutable, point-in-time** records — once accepted, never edited; a changed decision
  is a *new* ADR marking the old "Superseded by." Truth is the *full chain*, not the
  latest doc. The inverse of a specops living spec, which is continuously edited so the
  single current document always reflects desired state. (MADR softens this with an
  "updated" date.)
- **Principles — the key prior art for the "why":** ADRs and design docs are *built* to
  preserve rationale (context, alternatives, trade-offs); RFC cultures exist precisely to
  stop teams "relitigating past choices because nobody wrote down why." Difference from
  `principles.md`: ADRs preserve the why as a *frozen historical log*, decisive at the
  moment then inert; `principles.md` is *living and decisive*, continuously referenced
  *down into* specs as active governing constraints. ADRs answer "why did we decide
  this?"; living principles answer "what rule must this spec obey right now?"
- **Drift:** None — prose logs never mechanically checked against code; staleness is
  silent. Polar opposite of BDD.
- **Weight — a strength:** just markdown files. The lightest possible approach, which is
  why it spread so widely.
- **Co-authorship:** Humans documenting decisions for future humans — the audience is the
  next engineer asking "why is it this way," not an agent receiving desired-state
  instructions.
- **Stronger than specops at:** lightness, and being the original first-class home for
  rationale/"why" as a durable artifact.

Sources: <https://martinfowler.com/bliki/ArchitectureDecisionRecord.html> · <https://adr.github.io/> ·
<https://www.industrialempathy.com/posts/design-docs-at-google/>
