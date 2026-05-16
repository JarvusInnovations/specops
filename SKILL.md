---
name: specops
description: Spec-driven development workflow where specs are the source of truth, paired with a plan protocol for tracking work-in-flight as a micro-DAG. Use this skill whenever starting new features, planning implementation, writing specs, reviewing code against specs, working in or with a `plans/` directory, closing out a plan, or when the user mentions "spec", "specs/", "spec-first", "plans/", "plan protocol", "closeout commit", or asks how something should work or what to work on next. Also use when creating a new project that will use this development methodology, or when onboarding someone to a spec-driven codebase.
---

# Spec-Driven Development (SpecOps)

## Philosophy

Specs declare the complete desired state of the software. Implementation follows spec. All work begins with a spec update.

This is not documentation-driven development (where docs describe what was built). This is specification-driven development — the spec describes what *should exist*, and the implementation is brought into conformance with it. The spec leads; the code follows.

### Why this matters

When agents or developers implement features, they make hundreds of micro-decisions. Without a spec, each decision is a guess that may or may not match the user's intent. With a spec, those decisions are already made — the implementer's job is execution, not invention. This is especially powerful for AI-assisted development where multiple agents may work on different parts of the same system.

### The core loop

```
1. Spec change  →  propose what should be true
2. Accept       →  reviewer agrees on desired state
3. Implement    →  bring code into conformance
4. Verify       →  compare running software to spec
```

Code without a corresponding spec is unspecified behavior — it may exist for practical reasons, but nothing guarantees it. Spec without corresponding code is a known gap — track it.

## How to write specs

### The right level of detail

Specs declare **what** must be true, not **how** to implement it.

**Right level — declarative state + rules:**
> "Each row shows: from_stop_name, to_stop_name, pathway_mode label, completion fraction (populated field count / applicable field count). Sort: incomplete first, then alphabetical by from_stop_name. A pathway is 'on this level' when both its from_stop and to_stop share the same level_id."

This tells an implementer *what* must be true without dictating *how*. It's testable — you can look at the screen and verify conformance.

**Too vague — feature narratives:**
> "The task list shows pathways grouped by level with completion tracking."

An agent reading this still has to make hundreds of decisions. Which fields? What sort order? What happens when data is missing?

**Too detailed — implementation pseudocode:**
> "Query pathways WHERE from_stop.level_id == to_stop.level_id, LEFT JOIN field_notes, ORDER BY field_complete ASC, render each as a `<li>` with..."

This is just writing the code twice. The spec rots the moment implementation diverges.

### What specs should cover

- **Display rules** — what data appears and under what conditions
- **Data requirements** — where data comes from (API, local DB, derived)
- **Actions** — what the user can do and what each action causes
- **Navigation** — where you can go from here, where you came from
- **Business rules** — calculations, state machines, validation logic
- **API contracts** — request/response shapes, auth, error cases

### What specs should NOT cover

- **Visual design** — colors, spacing, fonts. That's wireframes + theme constants.
- **Widget/component decomposition** — how screens break into classes. Implementation decision.
- **Test cases** — tests derive from specs but aren't the spec.
- **Variable names, file paths** — implementation details that change freely.

## Spec directory structure

Organize specs by what they describe, not by when they were written:

```
specs/
├── README.md              # Workflow docs, directory layout, format conventions
├── architecture.md        # Tech stack, project structure, foundational decisions
├── data-model.md          # Schema, field definitions, relationships
├── api/                   # One file per endpoint or endpoint group
│   ├── conventions.md     # Auth, versioning, error envelope, content types
│   └── <endpoint>.md
├── screens/               # One file per screen/route
│   └── <screen-name>.md
└── behaviors/             # Cross-cutting rules that span multiple screens
    └── <behavior>.md
```

**screens/** — one file per screen/route. What the user sees and can do at that URL.

**behaviors/** — rules that span multiple screens. When a screen spec says "completion fraction", the completion behavior spec defines how it's calculated.

**api/** — the contract between client and server. Both sides implement to these specs.

## Spec file templates

### Screen spec

```markdown
# Screen: <Name>

## Route
The path/URL for this screen.

## Data Requirements
What data this screen needs and where it comes from.

## Display Rules
Declarative description of what appears and under what conditions.
This is what a reviewer checks the implementation against.

## Actions
What the user can do and what each action causes.

## Navigation
Where you can go from here, where you came from.
```

### Behavior spec

```markdown
# Behavior: <Name>

## Rule
The invariant or rule, stated declaratively.

## Applies To
Which screens or components this behavior affects.

## Details
Edge cases, calculations, timing, error handling.
```

### API spec

```markdown
# API: <Name>

## Endpoint
Method, path, auth requirements.

## Request
Parameters, body shape with field types.

## Response
Success body shape with field types. Error cases.

## Notes
Caching, idempotency, offline implications.
```

## How agents use specs

When implementing a feature or fixing a bug:

1. **Read the relevant spec first.** Every screen, endpoint, and behavior has a spec file. Read it before writing code.
2. **The spec answers "what", not "how".** It says what data appears, what actions exist, what rules apply. It does not dictate widget trees or class hierarchies.
3. **If the spec is ambiguous, clarify the spec** — don't guess and code. Propose a spec amendment.
4. **If the spec is wrong, fix the spec** — don't work around it in code.
5. **When done, check your work against the spec** — every display rule, every action, every conditional.

### When starting a new feature

1. Write or update the spec files first
2. Get the spec reviewed and accepted
3. Then implement to match the spec
4. Verify the running software matches what the spec says

### When fixing a bug

1. Check if the behavior is specified — if so, the spec is right and the code is wrong
2. If the behavior is unspecified, decide: should the spec be updated to cover this case, or is the fix obvious enough to just code?
3. For non-trivial fixes, update the spec first so the fix is documented

### When reviewing code

Compare the implementation against the spec, not against your own ideas of how it should work. The spec is the acceptance criteria.

## Plans: the work DAG that bridges specs to code

Specs describe **state** (what should be true forever). Plans describe **motion** (how we're getting there next). Every chunk of feature work starts with a plan file in `plans/` declaring its scope, the specs it implements, its dependencies on other plans, and concrete validation criteria. The plan files together form a micro-DAG that is the project's working plan.

Plans are temporal — once merged, they freeze as historical record. Their merged-PR links plus completed validation criteria are the project's working memory of what got built, how, and what was deferred.

A plan's frontmatter:

```yaml
---
status: planned          # planned | in-progress | done | blocked | cancelled
depends: [other-plan-slug]
specs:                   # spec files in THIS repo that this plan implements
  - specs/architecture.md
upstream-specs:          # (optional) specs in OTHER repos this plan consumes
  - other-repo:specs/behaviors/transactions.md
issues: [128]
pr: 42                   # set at closeout
---
```

A plan's body has a fixed template: **Scope**, **Implements**, **Approach**, **Validation** (load-bearing checkbox list — converts "in-progress" to "done"), **Risks / unknowns**, **Notes** (populated at closeout), **Follow-ups** (populated at closeout).

The full protocol — frontmatter schema, body template, status lifecycle, the closeout-commit ritual, the Follow-ups taxonomy (Issue / Deferred to plan / Tracked as / None), and the deferral-absorption rule — is in [references/plans-protocol.md](references/plans-protocol.md). Read it before authoring or closing out a plan.

### Querying the plans DAG

`plans/README.md` deliberately does **not** maintain a hand-drawn DAG or a status table — they'd rot the moment someone forgot to update them. Two scripts query the authoritative frontmatter on demand:

- **`scripts/plans-dag <plans-dir>`** — emits a Mermaid graph of the DAG with nodes styled by status. Add `--fence` to wrap in a Markdown code fence; `--direction LR` for horizontal layout.
- **`scripts/plans-next <plans-dir>`** — prints plans ordered by readiness. Ready plans first (sorted so the plan that unblocks the most downstream work appears first), then blocked plans with their unfinished deps called out.

Both are zero-dependency Node.js scripts — usable the moment the skill is checked out. See `scripts/lib/plans.js` for the shared parser if extending.

## Setting up spec-driven development in a new project

1. Create a `specs/` directory at the project root
2. Write `specs/README.md` documenting the workflow and directory layout
3. Write `specs/architecture.md` with foundational tech decisions
4. For each feature area, create the relevant spec files before coding
5. Reference the specs directory in your project's CLAUDE.md or README
6. Establish the convention: PRs that add features should include spec updates
7. Set up the spec drift auditor (see below)
8. Set up the plans protocol (see below)

### Setting up the spec drift auditor

The spec drift auditor is a specialized agent that does an exhaustive comparison of your `specs/` directory against the actual implementation, producing tables of gaps, undocumented implementations, and conflicts. To set it up in a project:

1. **Copy the agent definition** from this skill's `references/spec-drift-auditor.md` into your project at `.claude/agents/spec-drift-auditor.md`. Customize the "Methodology" phases to match your project's structure — for example, update Phase 3 ("Inventory the Implementation") to list the specific directories and key files in your codebase (source directories, migration paths, frontend code, infrastructure files, etc.).

2. **Copy the command definition** from this skill's `references/audit-spec-drift.md` into your project at `.claude/commands/audit-spec-drift.md`. This gives users a `/audit-spec-drift` slash command that launches the auditor agent.

3. **Reference in CLAUDE.md** — add a note to the project's CLAUDE.md mentioning the auditor is available, e.g.:

   ```
   ## Spec Drift Auditing
   Run `/audit-spec-drift` to launch a comprehensive audit comparing specs/ against the implementation.
   ```

The reference files are located at:

- `references/spec-drift-auditor.md` — the agent definition (goes in `.claude/agents/`)
- `references/audit-spec-drift.md` — the command definition (goes in `.claude/commands/`)

Note: the auditor checks the `specs:` field of plan files and the `specs/` tree. It does **not** check `upstream-specs:` (those are owned by other repos by design — see the plans protocol).

### Setting up the plans protocol

The plans protocol gives a project a structured way to track work-in-flight without it rotting. To set it up:

1. **Create the `plans/` directory** at the project root.
2. **Write `plans/README.md`** that briefly states what plans are (motion vs state) and points at [references/plans-protocol.md](references/plans-protocol.md) for the full spec. Resist the urge to maintain a DAG drawing or status table inside it — both rot. The scripts below regenerate that view on demand.
3. **Document the protocol in the project's CLAUDE.md** — add a Plans section summarizing the workflow (statuses, closeout commit, Follow-ups taxonomy) and link to `plans/README.md`. The reference doc in this skill is the canonical source; the project CLAUDE.md just needs enough for someone working in the repo to find their way without re-reading the whole reference.
4. **Make `scripts/plans-dag` and `scripts/plans-next` accessible.** Easiest is to symlink or copy them from this skill into the project (e.g., `.claude/scripts/`). Both are zero-dep Node.js — they work the moment they're on disk.
5. **Establish the convention** in the team: a new chunk of work starts with a plan file; the last commit before merge flips it to `done`. Quick-reference checklist for closeout is in [references/plans-protocol.md](references/plans-protocol.md#quick-checklist-for-a-closeout-pr).

## Keeping specs alive

Specs rot when they diverge from reality. Prevent this by:

- Making spec updates part of the PR process — if the code changes behavior, the spec should change too
- Periodically auditing specs against the running software
- Treating spec-code divergence as a bug, not technical debt
- Having agents read specs before implementing, which creates a natural feedback loop when specs are wrong
