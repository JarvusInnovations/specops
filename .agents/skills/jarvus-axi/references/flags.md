# Flag and argument parsing

Upstream principle 6 says an unknown flag must fail loud. The SDK does not enforce it for you:
a command handler receives raw `args`, and a hand-written parser with a `default:` branch drops
whatever it doesn't recognize. That has bitten us more than once. One tool's
`calendar update --transparency transparent` reported success and changed nothing. Another's
search with a misspelled `--querry` ran unfiltered. In both cases the agent got plausible
output and carried on.

So every tool has one strict parser, and every command goes through it.

## The parser

One module (`src/flags.ts`) with one declaration per command or subcommand:

```ts
export interface FlagSpec {
  value?: string[];        // flags that take a value: --limit 10
  boolean?: string[];      // switches: --available
  multi?: string[];        // repeatable value flags, collected into string[]
  deprecated?: Record<string, string>; // renamed, removed or commonly guessed flag -> hint
  positionals?: number | "many";       // how many positional args; default 0
  usage?: string;          // usage line shown when positionals are wrong
}

parseFlags(command, argv, spec) // -> { positional, flags, multi }
```

Keep every command's spec in one table so rejection stays consistent, and so a test can walk
the table.

## What it rejects

All of these fail before any network call or file write:

| Input | Code | The error says |
| --- | --- | --- |
| Unknown flag | `UNKNOWN_FLAG` | ``valid flags for `<cmd>`: --a, --b (--help and --account always allowed)`` |
| A flag in `deprecated` | `UNKNOWN_FLAG` | the targeted hint, in place of the list |
| Value flag with no value | `USAGE` | which flag, and its expected value |
| Switch given a value | `USAGE` | that it takes none |
| Repeated non-`multi` flag | `USAGE` | which flag |
| Extra or missing positional | `USAGE` | the usage line |
| Unknown subcommand | `VALIDATION_ERROR` | the valid subcommands |
| Contradictory flags | `VALIDATION_ERROR` | both flag names |
| Unknown *value* | `VALIDATION_ERROR` | the allowed values |

All three codes exit 2 (see `fail-closed.md`).

Some of these are worth spelling out.

**Positional count.** A silently ignored positional is as bad as a silently ignored flag. One
tool's `auth logout <name>` logged out of the default account whatever name was given, until
the parser started counting.

**Contradictory flags** are rejected, never settled by precedence. `--team` with `--user`,
`--billable` with `--non-billable`, a `--today` shortcut with `--from`: the agent meant one of
them, and guessing which is the same failure as dropping a flag.

**Unknown values.** An unrecognized `--fields` name is an error, not a missing column. An enum
flag lists its allowed values. A `--user` or `--project` that doesn't resolve is an error,
never an unfiltered result.

**Always-allowed flags.** `--help` is valid everywhere. If the tool has a global selector
(`--account`, `--tz`), it is valid everywhere too, and the unknown-flag message names it so the
agent doesn't conclude it is unsupported.

## Hints for flags that don't exist

Keep a table of flags that were renamed or removed, and of flags the tool never had but agents
reach for out of habit:

```ts
deprecated: {
  "--json": "--json is not supported; use --json-out to write JSON to a file",
  "-n": "-n is not a flag of this tool; use --limit",
  "--until": "--until is now --to",
}
```

Three details make the table work:

- **Legacy names must parse bare.** If the parser demands a value for a flag it no longer
  knows, a trailing `--json` dies with "requires a value" before the hint can fire.
- **Echo the flag as the agent typed it** (`-n`, not `--n`).
- **A suggestion must be true of the command printing it.** One tool advertised its export
  flags as "always allowed" from a command that had just rejected them. Classify inside the
  single rejection function, so the wording cannot drift between commands.

## Retired commands redirect

When a command is renamed, keep the old name registered. It fails with `VALIDATION_ERROR` and a
hint that is the corrected call with the caller's own arguments folded in:

```
error: recall is now `search`
code: VALIDATION_ERROR
help[1]:
  Run `agent-recall-axi search "flange" --limit 5`
```

Do not add silent aliases. An alias hides the rename from the agent, so it keeps using the old
name, and the tool carries two spellings forever. At most one documented alias per command is
fine when both names are natural.

A command or flag that is specified but not built yet is declared as planned and fails as
`USAGE` with "not available yet". Its `--help` says the same. Help must be honest about what
runs today.

## Lexical rules

- `--flag=value` and `--flag value` both work, except optional-value flags (the `*-out`
  exports), which take their value only with `=`. See `machine-output.md`.
- A value-taking flag followed by something that looks like a flag (`--name`) is a missing
  value. Otherwise the next token is the value, so `--body "--- draft ---"` works.
- Only `--<letter>` starts a flag. Dash-led free text (`- item`, `---`, `-5`) in a positional
  is text, and negative numbers are values.
- `--` ends flag parsing.
- Short flags are not house style. If an agent guesses one, hint the long form.

## Where the SDK is heading

Upstream has accepted the direction of declaring flags to the SDK itself
([kunchenguid/axi#229](https://github.com/kunchenguid/axi/issues/229)): commands registered as
`{ flags, run }`, a top-level `globalFlags`, per-flag refusal hints, and an exported
`checkFlags()` for nested subcommand dispatchers. When that ships in the `axi-sdk-js` version
a tool depends on, declare flags through the SDK and keep only what it doesn't cover
(positional counts, contradictions, value validation). Until then, copy the reference parser
named in `canonical-sources.md`.

## Tests that keep it true

- **Sweep every command.** For each entry in the spec table, run it with `--bogus` and assert
  exit 2 and a message listing that command's flags.
- **Compare declarations with help.** Assert every declared flag appears in that command's
  `--help`, and the reverse. This is what finds undocumented flags.
- **Run every hint.** Extract each ``Run `<tool> …` `` the tool can print and execute it
  against fixtures. A hint that fails is worse than no hint.
