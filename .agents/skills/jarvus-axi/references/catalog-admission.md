# AXI catalog admission

The upstream repo ([kunchenguid/axi](https://github.com/kunchenguid/axi)) keeps a community
catalog of AXI tools. Its `VISION.md` requires an independent review of the tool's pinned
source before a tool is admitted, and what a contributor says about their own tool doesn't
count as evidence. The reviewer reads the code.

Run the same review ourselves first. Every submission that skipped this went through several
rounds; the ones that did it were merged on the first or second pass.

## Before submitting

### 1. Pin a release

- The tool is released: a tag, a GitHub release and a version on npm.
- **The tag's commit equals the `gitHead` npm reports** (`npm view <pkg>@<version> gitHead`).
  The catalog entry pins that commit.
- Prefer a version published by CI with provenance. A manual first publish is acceptable;
  the entry says so.

### 2. Review the pinned source independently

Have a reviewer with no stake in the tool read a checkout of the tagged commit. A subagent
works well. Brief it to:

- read the source and report what the code does, not what the README says
- run the tool only under a temporary `HOME` and config directories
- make no live calls to the service and no mutations
- mark each claim as observed (it ran the command) or cited (file and line)
- run the test suite and report the counts

Tell it what to hunt for, in this order:

1. **Fail-open behavior, across the whole tool.** Any failed, partial or unparseable read that
   becomes empty, zero, a no-op or success, and any mutation that reports success it didn't
   confirm. Check every command, the hook installer and the daemon or API client. See
   `fail-closed.md`. This is what the upstream reviewer blocks on.
2. **Mutations and their gates.** List every mutating command and whether it is gated. Include
   the commands that loosen a safeguard.
3. **Default tables wider than four columns.**
4. **The home view and hook:** what they print, whether it is scoped, whether private content
   could reach every session, whether anything installs a hook implicitly.
5. **Flags and commands:** unknown ones fail with exit 2 and a list; `--help` per command;
   `--version`.
6. **Truncation, counts and empty states.**
7. **Privacy and network:** where credentials live and with what modes, what hosts are
   contacted, what is logged.
8. **CI and release:** what is gated, whether publishing has provenance.

### 3. Fix first

Fix what the review finds and release again, in preference to recording a defect as an
exception. Then review the new pin. Repeat until a review finds nothing in the fail-open
class. Expect more than one round the first time a tool goes through this.

An exception is for something that doesn't fit the tool, not for something not yet fixed.

### 4. Write the entry

Append the entry to the **end** of the `community` list in `catalog.yaml`. An entry placed
mid-list has been rejected.

```yaml
- name: <tool>
  url: https://github.com/JarvusInnovations/<tool>
  author: Jarvus Innovations
  domain: <one or two words>
  description: "<what an agent can do with it, one or two sentences>"
  admission:
    status: admitted | exception
    reviewed_revision: <full commit sha of the tag>
    reviewed_components:
      - <every file the observations cite>
    source_observations:
      - "<dense paragraph: what the code does, with file references and (observed) marks>"
    exception: "<each principle not met, and why>"
```

- Match the depth and style of the most recent entries in the file.
- `reviewed_components` lists every file cited in the observations. A cited file missing from
  the list is a review finding.
- Observations cover: version and dispatch, flag parsing, output and tables, write paths and
  gates, the home view, hooks, privacy and network, and CI.
- Say plainly what was **not** verified ("HTTP behavior was verified against a local stub, not
  the live service"). The reviewer repeats it, and it does not block.
- Report CI honestly, including a flaky run. An accurate note about a failed attempt passes; an
  inaccurate one gets caught.

### 5. Exceptions that have precedent

| Situation | Recorded as |
| --- | --- |
| No session-end capture; SessionStart hook only | Principle 7 exception. Common and accepted. |
| A default table with a fifth column | Principle 2 exception, with the reason for that column. Or drop the column. |
| A core action with no `--confirm` | Exception stating what guards it instead (limits, refusals, dry-run). |
| Service management on one platform only | Platform note. |

Exceptions need the reasoning. "Ungated send" alone will draw a question; "ungated send,
bounded by a first-contact refusal and per-minute limits that themselves require `--confirm`
to loosen" is an answer.

### 6. Open the PR

- Regenerate the README and site from the catalog (`pnpm run docs:gen`) and check them
  (`pnpm run docs:check`). Never hand-edit the generated regions.
- One commit: `docs(catalog): add <tool> to the community catalog`.
- Follow the upstream repo's own contribution gate for pushing. Read its `AGENTS.md` first;
  it changes.
- The PR description must describe the entry as it is. An automated reviewer compares them and
  fails the check when they disagree, for example after a rename.

## During review

- **Fix and re-pin; don't argue.** When the reviewer finds a defect, fix it in the tool, cut a
  release, update `reviewed_revision` and the observations, and reply with what changed per
  version.
- A text-only correction at the same pin needs no new release.
- **Every check must be green on the current head** before it merges, including automated
  review bots. If a bot's finding is stale, push so it re-runs; don't ask for it to be waived.
- **Rebase when the catalog moves.** Other entries land at the end of the same list, so
  conflicts in `catalog.yaml` and the generated files are routine. Rebase, keep your entry
  last, regenerate.
- Keep going after the reviewer's finding is fixed. When one fail-open is found, there are
  usually more of the same kind; find them before the reviewer does.

## Updating an entry

A later release doesn't require a catalog change. Re-pin when the entry's observations no
longer describe the tool: a rename, a changed command surface, or a fixed exception. Re-pin
PRs follow the same steps at smaller size.

## What isn't eligible

A tool whose source is private can't be reviewed and can't be listed. A CLI that only exists
as a bundle inside a private skill is the usual case.
