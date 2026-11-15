---
name: jarvus-axi
description: >-
  Jarvus house style for `*-axi` CLI tools (agent-facing CLIs built on `axi-sdk-js`): the
  conventions our tools share that go beyond the upstream `axi` skill's ten principles. Covers
  strict flag parsing, the `--json-out[=path]` side-channel (never `--json` on stdout) and other
  export formats, output vocabulary (four-column cap, `count: N of M`, time windows, hints,
  no-op wording), fail-closed reads and read-back mutations, mutation gates, multi-account
  handling, config and secrets, the home view, `doctor`, the `setup hooks` command, the
  npm-published repo recipe (specs, tests, CI, trusted publishing), and the AXI catalog
  admission checklist. Use this whenever you design, build, extend, review or release a Jarvus
  AXI tool, or any CLI named `<service>-axi`: adding a command or flag, choosing error codes or
  exit codes, deciding whether a mutation needs `--confirm`, adding accounts or profiles,
  writing a home view or session hook, preparing a catalog submission, or auditing an existing
  tool against house conventions. Also use it when a repo has `axi-sdk-js` in its dependencies,
  a `src/reference.ts` or `src/flags.ts`, or when someone asks "how do our axi tools do X".
  Read the upstream `axi` skill first for the principles; use `axi-skills` for bundling a CLI
  inside a skill.
---

# Jarvus AXI house style

Three skills cover an AXI tool, and they do not overlap:

| Skill | Answers |
| --- | --- |
| [`axi`](https://github.com/kunchenguid/axi) (upstream) | What a good agent-facing CLI prints: the ten principles. Read it first. |
| [`axi-skills`](../axi-skills/SKILL.md) | How to ship a CLI *inside a skill* as a committed bundle. |
| `jarvus-axi` (this one) | The choices we make where those two are silent or leave a choice open, and the recipe for an npm-published tool. |

Upstream keeps its skill and SDK to what every AXI needs, and has said tool authors are free
to go further. This skill is where our "further" is written down, so each new tool starts from
what the last ones learned instead of rediscovering it in review.

Most of these rules exist because an agent once acted on output that was wrong but looked
right. That is the failure to design against: an agent cannot tell a filtered list from an
unfiltered one, an empty result from a failed read, or a sent message from a timed-out one,
unless the tool says so. When a rule here seems strict, that is why.

## The rules, in brief

Each section is the short version. Open the reference when you are working in that area.

### Flags fail loud, completely

Every command declares its flags and its positional count, and anything else is refused before
any work happens, with the valid flags listed in the error. That includes extra positionals,
repeated flags, contradictory flags, and unknown *values* (a `--fields` name, an enum).
Renamed flags and flags agents guess from habit (`--json`, `-n`) get a targeted hint. Retired
commands stay registered as redirects that carry the caller's arguments.
→ [references/flags.md](references/flags.md)

### Machine output goes to a file

There is no `--json` on stdout. Stdout is always the TOON view. A script that needs the data
passes `--json-out[=path]` (or `--csv-out`, `--xlsx-out` and so on), and the full, uncapped
payload is written to a file while stdout adds a `wrote:` line, the columns, and a runnable
`jq` hint. Offer it only on commands where a script use exists.
→ [references/machine-output.md](references/machine-output.md)

### Output uses one vocabulary

Four default columns is a hard cap. Lists state `count: N of M` and never go silently partial.
Time input is human, and the resolved window is echoed with its year and zone. Hints read
``Run `<tool> …` to <purpose>`` and run as printed. A repeat of something already true says
`(no-op)` and exits 0. Home ends with the standard `--help` discovery line.
→ [references/output-vocabulary.md](references/output-vocabulary.md)

### Reads fail closed

A failed, partial or unparseable read is an error or `unknown (<CODE>: …)`. It is never
rendered as empty, `0`, `none`, a no-op or success. Error codes are `UPPER_SNAKE`. One
`formatError` sends usage-class codes to exit 2 and everything else to exit 1, and turns an
unexpected throw into `INTERNAL_ERROR` with a `doctor` hint and no stack trace.
→ [references/fail-closed.md](references/fail-closed.md)

### Mutations prove what happened

A mutation reports success only after reading the result back. If the outcome can't be
determined it says so with its own code and tells the agent to check before retrying. Gates
follow a ladder: routine actions are ungated, a specific cost or loss gets a flag named for it
(`--accept-fee`), destroying a named thing or loosening a safeguard takes `--confirm`, and
there is never a prompt or a generic `--force`.
→ [references/mutations.md](references/mutations.md)

### Accounts are explicit where it matters

Reads may use the default account. Once two or more accounts are stored, a mutation needs the
account named on the command line or pinned by the environment. Every output names the account
it acted on. Secrets stay off argv and out of output.
→ [references/accounts-and-config.md](references/accounts-and-config.md)

### Home never fails, and hooks install one way

The no-argument view never errors, never exits non-zero and never does work that grows with
the account. A failed live read shows as `unavailable (<CODE>: …)` with a `doctor` hint.
Hooks are installed only by `setup hooks`, following the upstream reference tools, with our
`--scope` extension.
→ [references/home-doctor-hooks.md](references/home-doctor-hooks.md)

### The repo follows the npm recipe

Most of our tools are npm packages, not skill bundles: `bin/` plus `src/` built with `tsc`, a
`reference.ts` that feeds help and a generated SKILL.md, specs and plans kept with specops,
hermetic tests, a no-credentials smoke test in CI, and trusted publishing with the version
taken from the release tag.
→ [references/repo-and-release.md](references/repo-and-release.md)

### Catalog submissions are reviewed before they are sent

The upstream catalog admits a tool only after a pinned-source review, and its reviewer blocks
on fail-open behavior. Run our own review first and fix what it finds.
→ [references/catalog-admission.md](references/catalog-admission.md)

### Copy from the canonical source

Our shared modules (flag parser, error formatter, export writer, renderers) are copied between
repos, not packaged. Copy from the repo named in
[references/canonical-sources.md](references/canonical-sources.md), not from whichever tool
is nearest, because the older tools predate several of these rules.

## Starting a new tool

1. Read the upstream `axi` skill, then this file.
2. Decide the distribution: npm package (the default), a skill bundle (`axi-skills`), or both.
3. Scaffold from the current reference tool in `canonical-sources.md`. Bring the parser, the
   `formatError`, the renderers and the test helpers with it.
4. Write `specs/principles.md` first: the trade-offs this tool decides, each with its reason.
5. Design the command surface, and for each mutation write down its gate and why
   (`references/mutations.md`).
6. Build the home view and `doctor` early. They are what an agent and a maintainer see first
   when something is wrong.
7. Before the first release, run the catalog checklist even if you are not submitting yet. It
   is the cheapest full review the tool will get.

## Reviewing an existing tool

Check these first. They are the defects that have reached users or blocked a catalog
submission:

- An unknown flag or extra positional that is silently dropped.
- A failed read that renders as an empty list, a zero or "nothing to do".
- A mutation that prints success from the request it sent, not from what the server stored.
- A timeout on a mutation reported as a plain failure.
- A hook installer that prints a warning and exits 0 when a write failed.
- A default table with five or more columns and no written justification.
- A home view that can hang or throw when the network is down.
- `--json` on stdout.

## When the tools disagree

The tools were built over many months and the conventions evolved, so older tools differ from
this skill. When they do, this skill is the intended answer. Fixing an older tool to match is
welcome, as its own change. Do not copy a deviation forward into a new tool.

If you find a case these rules do not cover, decide it in the tool's `specs/principles.md`
with a `> Why:` line, and propose it here if a second tool needs the same answer.
