# Mutations

Upstream asks that mutations be idempotent and never prompt. This covers what it leaves open:
how a mutation proves it worked, what to say when it can't tell, and how to gate the ones that
matter without a prompt.

## Contents

- [Confirm by reading back](#confirm-by-reading-back)
- [Unknown outcomes](#unknown-outcomes)
- [Result shape](#result-shape)
- [Gates](#gates)
- [Product boundaries](#product-boundaries)
- [Never destroy without a copy](#never-destroy-without-a-copy)
- [Retries and limits](#retries-and-limits)
- [Keep logic out of the CLI](#keep-logic-out-of-the-cli)

## Confirm by reading back

A mutation reports what the server stored, not what the request asked for.

- After the write, identify the result from server state and print that.
- If the stored value differs from the request, print a `warning:` naming both, keep the id in
  the output so the agent can undo it, and exit 1.
- If the result can't be identified, print `confirmed: false` and exit 1.
- If a pre-write snapshot is needed for the comparison and it fails, refuse to write
  (`CONFIRMATION_UNAVAILABLE`).
- A cancel that answers without a status is read back; if the item is still there, fail
  (`CANCEL_UNCONFIRMED`).

This was found live. A datetime sent with an offset was silently shifted by the server, and a
tool that echoed its request reported a booking at a time it wasn't booked for.

For composed content (a message, a draft), show the text as the service stored it, since the
service may rewrite formatting.

**Writes to several targets never headline success if one failed.** A hook installer that
writes three agents' settings and fails on one says `partly installed (see errors)` and
exits 1.

**Local writes get the same treatment:** write atomically, read back, and report an error if
the entry isn't there.

## Unknown outcomes

Sometimes the tool can't know. The request was sent, and then the connection dropped or a
deadline passed. That is not a failure, and calling it one invites the agent to retry and do
the thing twice.

- Give it its own code (`OUTCOME_UNKNOWN`, or a domain name like `SEND_UNCONFIRMED`). Never
  report it as a plain failure or a timeout.
- Its help tells the agent how to check before retrying:
  ``Run `tool read <chat>` to see whether the message arrived before sending again``.
- Don't put a short client timeout on a mutation. If a daemon or server does the work, it
  finishes the write even when the client goes away.
- **Accepted means done.** If the upstream accepted the write and only our own bookkeeping
  failed afterwards, report success with a `warning:`. Reporting failure for a message that
  was delivered is the worst case.
- A 4xx means nothing happened, and the error says so.

**Use an idempotency key when the upstream has one.** Every send carries a request id, from
the caller or generated. A replay with the same id returns `action: already_sent` and exit 0.
The unknown-outcome error's first hint is the full retry command with that id, and the success
output warns that re-running without the id sends again.

## Result shape

```
action: updated
event: abc12345
start: 2026-06-03T14:00:00-04:00
note: was 2026-06-03T13:00:00-04:00
help[1]:
  Run `tool events update abc12345 --start 2026-06-03T13:00` to undo
```

- `action:` is a past-tense verb from a closed set per tool: `created`, `updated`, `deleted`,
  `sent`, `unchanged`, `already_sent`, `exists`, or `noop` with a `reason:`.
- Values are read back (see above).
- Include the prior value when there was one.
- Give the exact undo command in `help[]` when one exists. If the undo is too large to print,
  point at where the history lives.
- For bulk writes, list each item's before and after. That list is both the verification and
  the undo, so a partial problem should not exit in a way that hides it.
- `--dry-run` on batch commands reports per-row categories: will-change, no-op, invalid,
  missing.
- Say what happened outside the tool: `notified: 3 guests`, `invitee was emailed`.

Make undo a real verb where the domain has one (`uncancel`), so it shows in the command list.
Add a non-destructive `edit` beside destructive commands and point to it.

## Gates

There are no prompts and no generic `--force`. A prompt hangs an agent, and `--force` lets it
proceed without registering what it is agreeing to. Gate the consequence instead, by this
ladder:

| The action | Gate | Example |
| --- | --- | --- |
| Is what the tool is for, and routine | None. Write down why in the spec. | Sending a message from a messaging tool; booking a free room |
| Has a specific cost or loss | A flag **named for the consequence** | `--accept-fee`, `--discard-ink` |
| Destroys a named thing | `--confirm <name>`, where the name must match | `account remove work --confirm work` |
| Destroys something, or loosens a safeguard or widens access | `--confirm` | `auth logout`, raising a rate limit, widening a scope |
| Tightens a safeguard or narrows access | None, ever | Lowering a limit |
| Could act on the wrong account | Explicit account (see `accounts-and-config.md`) | Any mutation with 2+ accounts |

How to apply it:

- **Name the flag for what is lost** when you can. `--discard-ink` forces the agent to state
  the consequence; `--force` doesn't.
- **The refusal is a usage-class error whose help is the exact command to re-run,** with the
  gate flag added. When a safe alternative exists, list it first and the override second.
- **Price, then commit.** For anything with a cost, compute and print the cost, and refuse a
  non-zero amount unless the consequence flag is present (`PAYMENT_REQUIRED`,
  `FEE_NOT_ACCEPTED`). A cost that couldn't be read is treated as non-zero. `--dry-run` stops
  after the preview.
- **Prepare, then apply** is the alternative for content: write a local draft, echo the full
  rendering, and make one explicit command (`draft send <id>`) the single commit point.
- **Enforce the gate in the daemon or server too,** when there is one, so no other caller can
  skip it.
- **Gate the settings that guard ungated actions.** If sends are ungated because rate limits
  and a first-contact refusal protect them, then loosening those limits takes `--confirm`.
  Otherwise the justification for leaving sends ungated doesn't hold.
- **A false refusal is not conservative.** A gate that fires when nothing is at stake teaches
  the agent to pass the override by reflex. Refuse only when the loss is real, and verify it.
- Write the gate inventory in the spec: what is gated, what isn't, and why. The catalog entry
  records ungated mutations as an exception, and needs that reasoning.

## Product boundaries

A capability the credentials allow can still be withheld on purpose. The tool answers
`NOT_SUPPORTED` with a redirect to the safe path.

- **Where a reviewable intermediate exists, stop there.** An email tool creates drafts and
  doesn't send. An invoicing tool creates draft invoices and never marks them sent or paid.
  Where no intermediate exists, the tool does the action directly.
- **Write the reason in `specs/principles.md`,** including "do not implement this", so a later
  contributor doesn't helpfully close the gap.
- **Enforce it with a test.** One tool has a test that reads its own source and asserts the
  forbidden API call isn't there.
- Some boundaries have no override at all ("never makes anything public; no flag unlocks it").

## Never destroy without a copy

- **Replace, don't delete.** When an operation supersedes something the user made, move the old
  one to trash under a dated name (`<name> (replaced 2026-08-20 14:05)`) and print where it
  went (`backup:`). Trash it only after the replacement is complete and verified; otherwise
  leave both in place and say why.
- **Never create a state the tool refuses to operate on.** If the tool errors on duplicate
  names, then no command may create a duplicate. A collision is `EXISTS`, naming the occupant's
  short id and offering both real intents (`--replace`, or a different `--name`).
- Surface inconsistent states (duplicates, orphans) in browse and `doctor` output before they
  cause an error.

## Retries and limits

- A write that isn't idempotent is never auto-retried. On a rate limit, rewrap the error with
  the platform's actual limits and say to wait and retry manually with the same flags.
- The SDK or client may retry reads; surface `RATE_LIMITED` only when retries run out.
- Where the tool sends on someone's behalf, enforce its own limits (per minute, per hour, same
  content to many recipients) and report them in the refusal.

## Keep logic out of the CLI

A command handler parses, calls and renders. Guards, transactions and business rules live in
the library, daemon or server the CLI fronts. Logic that exists only in a command handler is
unreachable by every other caller, and it is where the two paths drift.

For a CLI over a raw third-party API there is no server to hold the rules. Put them in a
client module (`src/<service>/`), not in the command file.
