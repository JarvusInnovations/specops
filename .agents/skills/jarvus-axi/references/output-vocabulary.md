# Output vocabulary

The upstream principles say what output should achieve. This is the shared wording and shape
our tools use to get there, so an agent that has used one Jarvus tool can read the next one
without relearning it.

## Contents

- [Columns](#columns)
- [Counts and completeness](#counts-and-completeness)
- [Empty states](#empty-states)
- [Time](#time)
- [Truncation](#truncation)
- [Identifiers](#identifiers)
- [Hints](#hints)
- [No-op wording](#no-op-wording)
- [Help](#help)
- [Small rules](#small-rules)

## Columns

**Four default columns is a hard cap.** Upstream says "3-4 fields"; the catalog reviewer
counts, and a fifth column gets flagged. More to the point, a column costs tokens on every row
of every call.

A column earns a default place if it changes the agent's next decision on a common path. A
column that most rows leave empty, or that rarely affects what happens next, goes behind
`--fields`.

A fifth default column needs a written justification in the spec, stated as fewer turns or
fewer mistakes. One that held up: a cross-session search keeps a timestamp column because an
id names the session but not when the hit happened, and the time separates the latest decision
from superseded ones.

- `--fields a,b` adds columns. An unknown name is an error.
- `--full` lifts caps and adds everything.
- An optional column appears only when some row has a value for it.
- Split lean list columns from detail columns. A list row that carries the detail view's data
  can cost forty times the tokens.

## Counts and completeness

Every list says how much of the whole it is showing, in header fields:

```
count: 25 of 412
events[25]{id,start,title,status}:
  …
help[1]:
  Run `tool events --limit 100` to see more
```

- Put totals in header fields (`count:`), never inside the TOON array header. The array length
  is the number of rows actually present.
- When the backend can't give a cheap total, say `25 shown, more available` and name the exact
  way past the cap. Never invent a total, and never imply the list is complete.
- `complete: true|false` on reads that paginate. Paginate to completion by default. When a page
  cap stops you, say so (`capped_at_pages: 10`).
- An upstream window limit fails fast with the limit named. Don't clamp silently.
- `--limit 0` means no cap.
- Set default limits high enough that the common question is answered in one call. A week of
  calendar events should not need a second page.

## Empty states

One field, as upstream specifies: the list name, then a sentence.

```
events: 0 events found between 2026-06-01 and 2026-06-07
```

Not `events: []` plus a sibling `message:`. Echo the filters that produced the empty result,
and make the hints fit the empty case ("Broaden `--from`/`--to`"), not the populated one.

Empty means the read succeeded and found nothing. If the read failed, it is an error
(`fail-closed.md`).

## Time

**Input is human.** Accept dates, datetimes, spans and a few named tokens. Reject anything
ambiguous with `VALIDATION_ERROR` listing the accepted forms. Validate before the network call.

| Flag | Takes |
| --- | --- |
| `--from`, `--to` | A date, a datetime, or a token: `now`, `today`, `tomorrow`, `yesterday`, `±Nd`, `±Nw`, `±Nh` |
| `--since` | A lookback span: `90m`, `24h`, `7d`, `2w`, `1y` |
| `--today`, `--this-week` | Shortcuts, where the tool has an obvious default window |
| `--tz <iana>` | Display zone, as a global flag |

- Ranges are half-open, `[from, to)`. A date-only `--to` covers that whole day. Half-open
  windows let consecutive batches tile with no gap or overlap.
- `from >= to` is an error, not an empty result.
- A shortcut combined with `--from`/`--to` is an error.
- Week start comes from the account's own preference when the service has one, falling back to
  Monday and saying so.
- Weekday names ("next tuesday") are deliberately not accepted. They are ambiguous near the
  boundary.
- Keep event-time flags separate from date filters. When a bare date is given where an instant
  is needed, pick a documented default and print a visible `note:` saying what was assumed. One
  tool silently stamped events at noon and sorted them out of order.

**The resolved window is always echoed**, with the year and the zone:

```
range: 2026-06-01 → 2026-06-07 (this-week, America/New_York)
```

An agent that sees the window can catch a wrong year. One that doesn't will report last year's
data as this week's.

**Display:**

- Show instants in the local offset, never bare UTC `Z` and never the upstream's own zone. If
  an item was created in another zone, disclose it (`(set in Europe/Berlin)`) without applying
  it.
- State the zone once in the header (`tz:`), then keep rows short: `HH:MM:SS`, or
  `MM-DD HH:MM:SS` when the list spans days.
- All-day values stay dates.
- Relative ages (`4d ago`) appear only next to an absolute time, and only on surfaces meant to
  be glanced at, such as home. They make output non-deterministic.
- When the tool falls back to UTC because no zone is configured, say so
  (`tz: UTC (TOOL_TZ unset)`).

## Truncation

- A cut cell ends with `…`.
- A cut detail field ends with `… (truncated, N chars total)`.
- Never cut inside a URL, a path or an id. Cut before it or keep it whole.
- Show the `--full` hint only when something was actually cut.
- `--head <n>` sets the per-row text length where rows carry prose.
- Order long views by ambient value, most useful first. The tail may be cut from context.

## Identifiers

- Show a fixed-length short id (eight characters). A shortest-unique prefix changes as data
  grows and breaks saved commands.
- Accept every form a user might paste: short id, full id, URL, name, `#name`. Resolve names.
- An ambiguous name is an error that lists each candidate as `<id> (<name>)`, so the agent
  fixes the call in one turn. Never pick one.
- An id that passes through unchanged needs no lookup. A slug that doesn't resolve is a
  `VALIDATION_ERROR` with a hint to the search command.
- Typed references use `<type>:<slug-or-id>`. Prefer one repeatable `--for <type>:<ref>` over
  a flag per type.

## Hints

Every `help[]` entry has one grammar:

```
Run `<tool> <full command>` to <purpose>
```

- **It runs as printed.** Fill in ids and values the tool already knows. Use a placeholder
  only for something that is the agent's choice.
- Quote interpolated paths. Keep `~/` outside the quotes so it still expands.
- Carry context flags (`--account`, `--project`, `--tz`) only when they matter: add
  `--account` only if more than one account exists.
- Paging hints carry the caller's filters forward.
- **Never point at the repo.** No `specs/`, `plans/`, branch names or unshipped files in
  hints, errors or stubs. The agent using the tool has the npm package, not the repo.
- A hint that leads to a command that will fail is worse than no hint.
- Keep hint text in one module so wording stays consistent.

## No-op wording

A repeat of something already true succeeds and says so:

```
already subscribed (no-op)
reaction: :eyes: already on message (no-op)
hooks: already installed and current at user scope (no-op)
```

Exit 0. Removing something that isn't there is also a no-op.

A no-op claim needs positive evidence that the state already holds. Only a definite not-found
(a 404) means "already gone". A response you couldn't read is not evidence of anything. Match
duplicates on full equality, not on one field.

Where output is structured, use `action: noop` with a `reason:` (see `mutations.md`).

## Help

- `--help` output is TOON too. Render string arrays in block form, one indented line per item.
  The encoder would inline them, so render help by hand.
- The last `help[]` line on the home view is always the discovery line:

  ```
  Run `<tool> --help` to see the full command list, or `<tool> <command> --help` for usage on any command
  ```

  Upstream doesn't require this. We include it because, on tools with more than a couple of
  commands, it saves the agent a turn of guessing.
- Per-command help lists usage, arguments, flags with defaults, and examples, generated from
  the same source as the skill (`repo-and-release.md`).

## Small rules

- Omit a field that has no value. Never print `null` or `undefined`.
- A value that could not be read is `?` or `unknown (…)`, never an empty cell that reads as
  zero or absent.
- Numbers are numbers. A count rendered through a template string comes out quoted.
- Output is deterministic for the same input and data, apart from the labelled relative ages.
- Only one module (`src/output/`) imports the TOON encoder.
- Output speaks the user's domain. Say "booking", not the upstream's internal entity name.
