# Fail closed: reads, errors and exit codes

Upstream principle 5 says how to report an empty result. It doesn't say the harder thing: an
empty result must never be reported unless it was actually observed. Most of the blocking
findings in our catalog reviews were this one class.

## The rule

A read that failed, timed out, came back partial or couldn't be parsed is an **error**, or a
value rendered as **unknown**. It is never rendered as:

- an empty list
- `0`, `none` or "nothing booked"
- a no-op ("already cancelled")
- success

Each of those is a confident statement about the world, and the tool has no basis for it.

Real cases this rule came from:

- An API client turned an empty `200` body into `{}`. A price preview with no total was read as
  `0.00`, and the tool committed the booking.
- A missing member id made every booking filter out, and `cancel` reported "nothing to cancel
  (no-op)" with exit 0.
- A corrupt local config was read as an empty default, which the next write then saved over
  the real file.
- A hook installer caught a write error, printed "completed with a warning" and exited 0.
- A home view showed "nothing booked" after a token expired.

## How to build it

**Validate decision-bearing fields where they are read.** If the code is about to branch on a
field, check the field is present and has the right type first. These are all errors
(`UNEXPECTED_RESPONSE`, or `CONFIG_INVALID` for local files):

- an empty `200` body
- a field that should be a list and isn't
- an object without the field you are about to decide on
- a local file that exists and doesn't parse

**Only a definite not-found is not-found.** A `404` means the thing is gone. A `200` without
an id is a response you couldn't read.

**Empty bodies are opt-in.** If an endpoint is verified to answer with an empty body on
success, allow it per call (`allowEmpty: true`) with a comment saying how it was verified.
Never make it the client default.

**Unknown is a value.** Where one field of a larger view can't be read, render it and keep the
rest:

```
bookings: unavailable (TOKEN_EXPIRED: session expired)
credits: unknown (UNEXPECTED_RESPONSE: no balance in response)
```

Clip the reason to a line (about 160 characters).

**Count partial results.** A lenient read that skips bad items says how many:
`unreadable: 2`, `malformed: 3 lines`, `unresolved: 4`, `complete: false`. One malformed item
once hid 837 good ones, and another time one failure went unmentioned among hundreds of
results. Both are wrong.

**Do not overwrite what you couldn't read.** If a state file fails to parse, refuse to write
it. Never overwrite a config file belonging to another tool (an agent's settings file) that
you couldn't parse.

## Fail open only for decoration

Some lookups decorate a result: resolving ids to names, reading a display preference, the live
block on the home view. Those must never fail the command they decorate. They fall back, and
add a `note:` naming what was skipped and how to fix it.

The test: if this lookup fails, is the main answer still true? If yes, fail open with a note.
If the lookup determines the answer (which records match, what something costs, whether it
exists), fail closed.

## Deadlines

Every network call has its own deadline. Without one, a hung upstream hangs the agent's turn,
and a hung home view produces no session context at all.

- Give reads a default (around 30 seconds) and make it configurable by an environment variable
  documented in the timeout error.
- Home and `doctor` probes get short budgets (a few seconds) and report `unknown` or
  `unavailable` on expiry.
- A `TIMEOUT` error says the outcome is unknown, suggests a retry for reads, and says how to
  extend the deadline.
- Mutations are different. A client-side timeout must not cancel a write in flight and then
  call it failed. See "Unknown outcomes" in `mutations.md`.

## Error shape

Errors are TOON on stdout, as upstream specifies:

```
error: unknown flag --querry for `search`
code: UNKNOWN_FLAG
help[1]:
  valid flags for `search`: --limit, --query (--help always allowed)
```

Optional `details:` carries structured context, such as the candidate list for an ambiguous
name.

### Codes

Codes are `UPPER_SNAKE`. Agents switch on the code, never the message, so codes are stable and
listed in the spec.

Shared across tools:

| Code | Meaning | Exit |
| --- | --- | --- |
| `USAGE` | Malformed invocation: wrong arity, missing value | 2 |
| `UNKNOWN_FLAG` | Flag not declared for this command | 2 |
| `VALIDATION_ERROR` | Well-formed but invalid: bad value, contradiction, unknown subcommand | 2 |
| `NOT_FOUND` | The named thing doesn't exist | 1 |
| `AMBIGUOUS` | A name matched more than one thing | 1 |
| `EXISTS` | The target already exists | 1 |
| `TIMEOUT` | A deadline expired on a read | 1 |
| `UNEXPECTED_RESPONSE` | The upstream answered with something unreadable | 1 |
| `RATE_LIMITED` | Upstream limit; include retry-after and the platform's limits | 1 |
| `INTERNAL_ERROR` | Anything not anticipated | 1 |

Auth and config codes are per tool (`NO_TOKEN`, `TOKEN_INVALID`, `TOKEN_EXPIRED`,
`SCOPE_MISSING`, `CONFIG_INVALID`, `ACCOUNT_REQUIRED`). Missing credentials exit 1: the
invocation was valid, and the operation failed.

Rules for mapping upstream errors:

- Translate in one place (`translateError`), from HTTP status or library error class to a code
  and a hint.
- Raw upstream bodies and stack traces never reach the output.
- Rewrap a generic 404 as a domain code (`DOCUMENT_NOT_FOUND`) when the tool knows what was
  being looked up.
- **Advice must fit the failure.** A 403 is `SCOPE_MISSING` with re-auth advice only when the
  upstream says it is a scope problem. Re-auth advice attached to a failure it can't fix is a
  dead end.
- A thin client over our own server may relay the server's error envelope, and builds the hint
  from its fields.

### One `formatError`

The SDK maps only its own `VALIDATION_ERROR` to exit 2. Pass `runAxiCli` a `formatError` that
does the rest:

```ts
const USAGE_CODES = new Set(["USAGE", "UNKNOWN_FLAG", "VALIDATION_ERROR"]);

export function formatError(error: unknown): { output: string; exitCode: number } {
  if (error instanceof AxiError) {
    return {
      output: renderFailure(error.message, error.code, error.suggestions),
      exitCode: USAGE_CODES.has(error.code) ? 2 : exitCodeForError(error),
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    output: renderFailure(`unexpected failure: ${message}`, "INTERNAL_ERROR", [
      "Run `<tool> doctor` to check credentials and connectivity",
    ]),
    exitCode: 1,
  };
}
```

Export it so the mapping can be unit-tested. A `--debug` flag, stripped before dispatch, may
send the stack to stderr.

The no-credentials CI smoke test (`repo-and-release.md`) exists to prove this function is
wired: it fails if a stack trace reaches the output.

## No dead ends

A refusal names what does work. `NOT_SUPPORTED` and `NOT_IMPLEMENTED` errors lead with the
alternatives, each with its limits, and say so plainly when there is none. A stub's `--help`
lists `instead[N]:`.

This matters more than it looks. An agent that hit a stub with nowhere to go once extracted
the tool's OAuth token and wrote its own script against the API, bypassing every safeguard the
tool had.

A stub says "coming in an upcoming release" and points at what works today. It never points at
a plan file.
