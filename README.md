# SpecOps

A Claude Code skill for **spec-driven development**: specs are the source of truth that declare the complete desired state of the software, paired with a lightweight **plan protocol** for tracking work-in-flight as a micro-DAG.

Specs lead; code follows. Every chunk of work starts with a spec update, gets a plan declaring scope/dependencies/validation, and closes out by bringing the running software into conformance with the spec.

## Install

```bash
npx skills add JarvusInnovations/specops
```

This repo *is* the skill — `SKILL.md` lives at the root, with supporting material under `references/` and zero-dependency helper scripts under `scripts/`.

## What's inside

| Path | What it is |
| --- | --- |
| [`SKILL.md`](SKILL.md) | The skill itself — philosophy, how to write specs (including encoding principles), the spec directory structure, and how agents use specs. |
| [`references/plans-protocol.md`](references/plans-protocol.md) | The full plan protocol: frontmatter schema, body template, status lifecycle, the closeout-commit ritual, and the Follow-ups taxonomy. |
| [`references/spec-drift-auditor.md`](references/spec-drift-auditor.md) | Agent definition (for `.claude/agents/`) that audits `specs/` against the implementation. |
| [`references/audit-spec-drift.md`](references/audit-spec-drift.md) | Slash-command definition (for `.claude/commands/`) that launches the auditor. |
| [`scripts/plans-dag`](scripts/plans-dag) | Emits a Mermaid graph of the plans DAG, styled by status. |
| [`scripts/plans-next`](scripts/plans-next) | Prints plans ordered by readiness — what to work on next. |

## Core loop

```
1. Spec change  →  propose what should be true
2. Accept       →  reviewer agrees on desired state
3. Implement    →  bring code into conformance
4. Verify       →  compare running software to spec
```

See [`SKILL.md`](SKILL.md) for the full methodology, and `references/plans-protocol.md` for the plan protocol that bridges specs to merged code.
