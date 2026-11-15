# jarvus-axi

A skill that teaches your coding agent the **Jarvus house style for `*-axi` CLI tools**:
agent-facing command-line tools built on [`axi-sdk-js`](https://github.com/kunchenguid/axi).

The upstream [`axi`](https://github.com/kunchenguid/axi) skill defines ten principles for a
CLI that agents use well. This skill is the layer on top: the specific choices our tools share
where the principles are silent or leave a choice open, learned from building and reviewing
more than a dozen of them.

## What it covers

- **Flag parsing** that rejects unknown flags, extra arguments, contradictions and unknown
  values, with hints for renamed and commonly guessed flags
- **Machine output** through `--json-out[=path]` and other per-format export flags, never
  `--json` on stdout
- **Output vocabulary:** the four-column cap, `count: N of M`, time windows, truncation, hint
  grammar, no-op wording
- **Fail-closed reads:** a failed read is never shown as empty or as success; shared error
  codes and exit codes
- **Mutations:** read-back confirmation, unknown outcomes, a ladder for gating without prompts
- **Accounts and config:** the multi-account model, config layout, environment variables,
  secrets
- **Home view, `doctor` and `setup hooks`**
- **The npm-published repo recipe:** layout, specs, hermetic tests, CI, trusted publishing
- **AXI catalog admission:** the review to run before submitting
- **Canonical sources:** which repo to copy each shared module from

## How it fits with the other skills

| Skill | Use it for |
| --- | --- |
| `axi` (upstream) | The principles. Read it first. |
| `jarvus-axi` | Our conventions on top, and the npm recipe. |
| [`axi-skills`](../axi-skills/README.md) | Shipping a CLI inside a skill as a committed bundle. |
| [`jarvus-release-flow`](../jarvus-release-flow/README.md), [`repo-setup`](../repo-setup/README.md) | Releases and repo plumbing. |

## Install

**Recommended scope: per-project.** Install it in each repo where an AXI tool is built. These
conventions govern ongoing work in that repo, so they should be version-controlled with the code:
every contributor's agent follows the same rules, and when the house style changes, the update
arrives as a diff the team can read.

```bash
npx skills add JarvusInnovations/agent-skills --skill jarvus-axi
```

Install the upstream skill alongside it:

```bash
npx skills add kunchenguid/axi
```

## When it applies

The agent should reach for it whenever it designs, builds, reviews or releases a `*-axi` tool:
adding a command or flag, choosing an error code, deciding whether a mutation needs a gate,
adding account support, writing a home view or hook, or preparing a catalog submission.
