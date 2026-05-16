# The Plan Protocol

If `specs/` is the architecture document (timeless: what should be true), `plans/` is the project plan (motion: how we get there). Each plan declares a scope, the specs it implements, its dependencies, and concrete validation criteria. Together, the plan files form a **micro-DAG of work** that bridges specs to running code.

This doc defines the protocol. It is meant to be portable across projects that adopt the [specops](../SKILL.md) workflow.

## What plans are — and are not

Plans are temporal. They describe a chunk of work to be done now: scope, dependencies, approach, and how we'll know it's finished. Once merged, a plan freezes — its merged-PR link plus its completed validation criteria become the project's working memory of what got built, how, and what was left for later.

| Plans are                                      | Plans are not                                                  |
| ---------------------------------------------- | -------------------------------------------------------------- |
| A micro-DAG of work bridging specs → code      | Specs (which are timeless, frozen by review, not by merge)     |
| One scope-bounded chunk of work per file       | Commits (a plan produces several commits, usually one PR)      |
| Dependency-aware (`depends:` is load-bearing)  | Tickets (flatter, more granular, live in your issue tracker)   |
| Validated by checkbox criteria at close        | Roadmap entries ("ship X by Y" — that's a different artifact)  |

Specs answer **what must be true**. Plans answer **how we're getting there next**.

## Directory layout

```
plans/
├── README.md              # Protocol index — usually just points to this reference
└── <slug>.md              # One file per plan
```

- **Location**: `plans/` at repo root.
- **Filenames**: kebab-case slugs, descriptive (e.g., `storage-foundation.md`, `github-oauth.md`, `auth-jwt-substrate.md`). No numeric prefixes — the slug *is* the plan ID, referenced by `depends:` entries in other plans.
- **No maintained DAG drawing or status table** in `plans/README.md`. The per-plan frontmatter is the single source of truth for both status and graph shape; a redrawn DAG or status dashboard would rot the moment anyone forgot to update both. Use the [`plans` script](#visualization-and-status) to query both on demand from the authoritative frontmatter. For ad-hoc queries:
  - In flight: `grep -l '^status: in-progress' plans/*.md`
  - Done: `grep -l '^status: done' plans/*.md`
  - Trace dependencies: `grep '^depends:' plans/*.md` or open the plan whose downstream you're tracing

## Frontmatter schema

Every plan begins with YAML frontmatter:

```yaml
---
status: planned          # planned | in-progress | done | blocked | cancelled
depends: [other-plan-slug, another-plan-slug]
specs:                   # spec files in THIS repo that this plan implements
  - specs/architecture.md
  - specs/behaviors/storage.md
upstream-specs:          # (optional) specs in OTHER repos this plan consumes
  - other-repo:specs/behaviors/transactions.md
issues: [128, 129]       # (optional) related issue numbers
pr: 42                   # (optional) merged PR — added at closeout, knowable only after `gh pr create`
---
```

Field semantics:

- **`status`** — see [Status lifecycle](#status-lifecycle) below.
- **`depends`** — list of plan slugs (filenames without `.md`) that must be `done` before this plan can start. Empty list (`[]`) for plans with no prerequisites. Update mid-stream if a new prerequisite is discovered.
- **`specs`** — specs in *this* repo that this plan implements. The [spec-drift auditor](./spec-drift-auditor.md) treats these as a contract: the implementation must match.
- **`upstream-specs`** *(optional)* — specs in *other* repos that this plan consumes. Format: `<repo-name>:<path-from-repo-root>`. **Informational only** — the spec-drift auditor does *not* check these; we don't promise to implement specs we don't own. The distinction exists so dangling references to dependency specs don't show up as drift findings.
- **`issues`** *(optional)* — related issue numbers in your tracker.
- **`pr`** *(optional)* — the PR that closed the plan. Set only when `status: done`.

## Body template

```markdown
# Plan: <title>

## Scope
Bounded statement of what's in and what's explicitly out. Out-of-scope items should
point to where they will land (other plan, future spec, deferred).

## Implements
Bullet list mapping each spec file to the specific behaviors/endpoints implemented.
Use sub-headings for "Own specs" / "Upstream specs" when both are present.

## Approach
Step-by-step strategy. Code sketches, key algorithms, module layout, interfaces.
Detailed enough that someone else could pick it up; not so detailed it's just the
code written twice.

## Validation
- [ ] Concrete, testable criterion 1
- [ ] Concrete, testable criterion 2
- [ ] ...
The load-bearing section. Converts `in-progress` to `done`. Each box flips to `[x]`
only when verified. Never silently rewrite a criterion to match what was built —
that's an amendment in its own earlier commit.

## Risks / unknowns
- **Named risk** — short description and how it'll be mitigated or watched.
Not prescriptive; helps the implementer know what to watch for.

## Notes
(Populated at closeout. Non-actionable carry-forwards: decisions made, gotchas
discovered, dependency surprises, version pins worth remembering.)

## Follow-ups
(Populated at closeout. See "Follow-ups taxonomy" below.)
```

## Status lifecycle

```
planned  ──►  in-progress  ──►  done   (frozen)
                  │
                  └──►  blocked         (waiting on a prerequisite or external event)
                  └──►  cancelled       (work abandoned)
```

Transitions are commits with specific message conventions:

- **Start work**: `chore(plans): mark <slug> in-progress`
  - Skippable for tiny plans — going straight to `done` at the end is fine.
- **Close**: `chore(plans): mark <slug> done (PR #<n>)` (see [The closeout commit](#the-closeout-commit) below).

`blocked` and `cancelled` are edge cases — most plans go directly from `planned` to `done`.

## The closeout commit

The last commit on the implementation branch, before merge, does **five things in one shot** under the message `chore(plans): mark <slug> done (PR #<n>)`:

1. **Frontmatter**: flip `status` to `done`, add `pr: <PR number>` (knowable once `gh pr create` returns).
2. **Validation checklist**: flip each `- [ ]` to `- [x]` for criteria you actually verified. If a criterion can't be verified at merge time (depends on a downstream plan, requires production deploy, etc.), **leave it unchecked** and add a one-line Notes entry explaining why and where it'll close out. **Never silently rewrite a criterion to match what you ended up doing** — that's a plan amendment in its own earlier commit.
3. **Notes** section: non-actionable carry-forwards — decisions, surprises, gotchas, learnings. Things future-you would want to know.
4. **Follow-ups** section: actionable items that didn't ship with this plan (see taxonomy below).
5. **Any downstream plans referenced by `Deferred to`** entries get edited in the *same commit* to absorb the deferral (see [Follow-ups taxonomy](#follow-ups-taxonomy)).

After merge: the plan is frozen. Historical record, no further edits.

## Follow-ups taxonomy

Each Follow-up entry takes one of four shapes. Pick deliberately — the shape encodes who owns the work next.

### `Issue [#N](link) — short description`

Use when the work is actionable but **not owned by any planned-or-in-progress plan**. File the issue first (e.g., via your issue tracker CLI) and link it. Example:

```markdown
- Issue [#48](https://github.com/org/repo/issues/48) — add CI check that EnvSchema and `.env.example` stay in lockstep
```

### `Deferred to [`<plan>`](<plan>.md) — short description`

Use when an **unstarted (`status: planned`) downstream plan** should own the work. **The same closeout commit must also edit that downstream plan to absorb the deferral** — typically a new bullet under Approach and a new criterion under Validation, cross-linked back to the deferring plan.

Example (in the closing plan's Follow-ups):

```markdown
- Deferred to [`api-skeleton`](api-skeleton.md) — `.env.example` lands when `EnvSchema` is introduced
```

…and in the *same* commit, `api-skeleton.md` grows:

```markdown
## Approach
…
Ship a `.env.example` file at the repo root that enumerates every `EnvSchema` field…

## Validation
…
- [ ] `.env.example` exists at the repo root with one entry per `EnvSchema` field (deferred from [`workspace`](workspace.md))
```

**Why the absorption rule**: without it, "Deferred to <plan>" is just a pointer that doesn't oblige anyone to do anything — the downstream plan can ship without ever absorbing the deferred work, and the deferral rots in place. Requiring same-commit absorption converts the pointer into a binding commitment.

If the downstream plan is already `in-progress` or `done`, use the `Issue` shape instead. **Never modify a plan that's actively being implemented or already frozen.**

### `Tracked as: <free-form pointer>`

Use for anything that's neither an issue nor another plan — waiting on community input, a vendor response, a design decision pending review. Example:

```markdown
- Tracked as: waiting on upstream maintainer to ship v2.1 (see thread linked in #channel)
```

### `None.`

Use when there are no follow-ups. Be explicit. A future reader can see the section was considered, not just absent.

```markdown
## Follow-ups

None.
```

## Relationship to `specs/`

Plans implement specs. Concretely:

- **A plan's `specs:` field lists what it implements.** The implementation must match those specs — the spec-drift auditor will hold it accountable.
- **Specs come first.** If you realize a spec needs to change mid-plan, the spec change is its own PR before the plan continues. Don't quietly drift the spec to match what you ended up coding.
- **Plans don't propose specs.** Specs are decided through their own review process. A plan's job is execution against an already-agreed-on state.
- **The spec-drift auditor reads `specs/`, never `plans/`.** Plans rot fast and are expected to. Specs are the auditable source of truth.

## After spec-complete

Plans don't go away once the initial DAG completes. They become the standing workflow for every future feature:

1. Update or add the relevant specs (own PR).
2. Add a new plan declaring how to bring code to the spec.
3. Implement, close out, freeze.

Completed plans stay as historical record. Their merged-PR links plus completed-validation criteria are the project's working memory.

<a id="visualization-and-status"></a>

## Visualization and status

`plans/README.md` deliberately does not maintain a hand-drawn DAG or status table — they'd rot the moment someone forgot to update them. Instead, two scripts query the authoritative frontmatter on demand:

### `plans-dag` — DAG visualization

```sh
# print Mermaid syntax to stdout
scripts/plans-dag plans/

# wrap in a code fence ready to paste into a Markdown doc
scripts/plans-dag plans/ --fence

# horizontal layout
scripts/plans-dag plans/ --direction LR
```

Reads each plan's `status`, `depends`, and `pr` fields and emits a Mermaid `graph` with nodes styled by status (`planned`, `in-progress`, `done`, `blocked`). Use it in code review, in stand-ups, or pasted (and dated) into a wiki snapshot. Don't commit a static rendering into `plans/README.md` — the next status flip will make it lie.

### `plans-next` — what to work on next

```sh
# show plans that are ready to start (deps met) and plans blocked on unfinished deps
scripts/plans-next plans/

# include in-progress plans in the listing
scripts/plans-next plans/ --include-in-progress
```

Skips `done` and `cancelled` plans, then lists what's left in two sections: **Ready** (deps all `done`) and **Blocked** (one or more deps still open, with each unfinished dep called out). Within each section, plans are topologically sorted so the plans that unblock the most downstream work appear first.

Both scripts share `lib/plans.js` — a frontmatter parser and DAG walker. See [`scripts/`](../scripts/) in this skill.

## Worked example: closing a plan

Suppose `workspace.md` ships scaffolding and discovers `.env.example` is naturally owned by the future `api-skeleton` plan. At PR-merge time, the closeout commit does this in one shot:

```diff
--- a/plans/workspace.md
+++ b/plans/workspace.md
@@ -1,7 +1,8 @@
 ---
-status: planned
+status: done
 depends: []
 specs:
   - specs/architecture.md
 issues: []
+pr: 9
 ---
@@ Validation
-- [ ] `git clone … && npm install && npm run dev` works on a fresh machine
+- [x] `git clone … && npm install && npm run dev` works on a fresh machine
… (each verified box flipped)
@@ end of file
+## Notes
+
+- ESM-only dep landmines, dedupe quirk in Vite — workarounds documented inline.
+- Pinned versions as of cutover commit: <list>.
+
+## Follow-ups
+
+- Deferred to [`api-skeleton`](api-skeleton.md) — `.env.example` lands when `EnvSchema` is introduced.
```

…and in the *same* commit, `api-skeleton.md` grows a bullet in Approach and a Validation criterion absorbing the deferral. One commit, message `chore(plans): mark workspace done (PR #9)`. After merge, `workspace.md` is frozen forever.

## Quick checklist for a closeout PR

- [ ] Frontmatter: `status: done`, `pr: <n>` added
- [ ] Every Validation box reflects reality (`[x]` only if verified; unverified stays `[ ]` with a Notes entry)
- [ ] Notes section populated (decisions, gotchas, version pins — not action items)
- [ ] Follow-ups section populated (Issue / Deferred to plan / Tracked as / None)
- [ ] Every `Deferred to <plan>` has an accompanying edit to that downstream plan, in the same commit, and the downstream plan is still `planned`
- [ ] Commit message: `chore(plans): mark <slug> done (PR #<n>)`
- [ ] No silent rewrites of Validation criteria to match what was built
