---
name: specops
description: Spec-driven development workflow where specs are the source of truth. Use this skill whenever starting new features, planning implementation, writing specs, reviewing code against specs, or when the user mentions "spec", "specs/", "spec-first", or asks how something should work. Also use when creating a new project that will use this development methodology, or when onboarding someone to a spec-driven codebase.
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

## Setting up spec-driven development in a new project

1. Create a `specs/` directory at the project root
2. Write `specs/README.md` documenting the workflow and directory layout
3. Write `specs/architecture.md` with foundational tech decisions
4. For each feature area, create the relevant spec files before coding
5. Reference the specs directory in your project's CLAUDE.md or README
6. Establish the convention: PRs that add features should include spec updates

## Keeping specs alive

Specs rot when they diverge from reality. Prevent this by:

- Making spec updates part of the PR process — if the code changes behavior, the spec should change too
- Periodically auditing specs against the running software
- Treating spec-code divergence as a bug, not technical debt
- Having agents read specs before implementing, which creates a natural feedback loop when specs are wrong
