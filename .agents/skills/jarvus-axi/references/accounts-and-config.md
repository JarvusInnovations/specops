# Accounts, config and secrets

## Contents

- [Single or multi-account](#single-or-multi-account)
- [The multi-account model](#the-multi-account-model)
- [Storage layout](#storage-layout)
- [Environment variables](#environment-variables)
- [Secrets](#secrets)
- [Auth commands](#auth-commands)

## Single or multi-account

Decide this up front, and write the decision in the spec.

**Single-account is a legitimate choice.** If one person has one account with the service, a
selector is surface area that buys nothing. Two of our tools are single-account by design and
say so.

**Go multi-account when a person plausibly has two:** work and personal, several workspaces,
several tenants or locations, several instances of a self-hosted product. Retrofitting it is
expensive, because every command's output and every stored path changes.

The noun follows the service: `--account` (an identity), `--space` or `--team` (a tenant or
workspace), `--instance` (a deployment). Use the word the service's own users use. The rest of
this page says "account".

## The multi-account model

The model started in gws-axi and each later tool adopted it. The reason for all of it is one
scenario: several agent sessions share one config directory, one of them changes the default,
and another's write lands in the wrong account.

### Resolution order

Highest first:

1. **Environment**: a token plus selector, or a pin (see below).
2. **The selector flag** on this command.
3. **The configured default**, set with `auth use <name>`.
4. **The only stored account**, when there is exactly one.
5. Otherwise a structured error listing the stored accounts, with one runnable line each.

Resolve lazily, only for commands that need an account. `--help`, `--version` and `setup`
never resolve one.

### Reads default, writes don't

With two or more accounts stored:

- **Reads** may fall back to the default.
- **Mutations** need the account named for this invocation, by flag or by the environment. A
  default is not enough. The error is `<NOUN>_REQUIRED` (`ACCOUNT_REQUIRED`, `SPACE_REQUIRED`,
  `TEAM_REQUIRED`), and its help gives the full command once per account.
- **Expensive reads** can take the same rule where a wrong target costs real time or money,
  such as an ad-hoc query against a production database.

With exactly one account, nothing needs the flag.

Each mutating command declares itself as one (`mutation: true` in its dispatcher entry), so
the rule is applied in one place and not per handler.

This rule takes the place of a confirm gate for the wrong-account risk. The friction is small,
it only appears when there is real ambiguity, and it removes silent wrong-account writes.

### Every output names the account

```
account: alice@example.com
account_source: default
```

- `account:` on every command that acted as one. For an instance-style tool, include the host:
  `instance: prod (metabase.example.org)`.
- `account_source:` appears when the choice wasn't visible on the command line: `default` when
  two or more accounts exist and the default was used, `env` when the environment decided.
  An account named by flag needs no source line.
- The home view lists the active account, the others, and whether writes currently require
  the flag.

The response is the only place a reader can learn which account a default or an environment
variable selected, so it has to say.

### The selector flag

- It is a global flag: valid on every command, like `--help`, and named in unknown-flag
  messages.
- Commands that manage the store (`auth login`, `account add`) take the name as a positional
  or their own flag, and aren't subject to the pin.
- **Hints carry the flag only when it matters.** Add `--account <name>` to a printed command
  only if more than one account exists. With one account it is noise in every hint.

### Pinning a session

An environment variable can pin a session to one account: `<TOOL>_AXI_ACCOUNT=<name>`. This is
for an operator who configures an agent's environment once and wants the account not to drift.

It is a pin, not a default:

| Situation | Result |
| --- | --- |
| Pin set, no flag | Acts as the pinned account, reads and writes |
| Pin set, flag names the same account | Fine |
| Pin set, flag names a different account | `ACCOUNT_LOCKED`. Refused, never overridden. |
| Pin names an account that isn't authenticated | `ACCOUNT_LOCK_INVALID` on every command. No fallback. |

- The pin satisfies the explicit-account rule for writes, because the operator already chose.
- A typo in the pin must fail loudly. Falling back to the default is the outcome the pin was
  set to prevent.
- The pin is disclosed wherever it applies: `account_source: env` on every command, and an
  `account_lock:` line on home, `auth status` and `doctor`.
- It is an accident boundary, not a security boundary. Anything that can run the tool can
  unset the variable. For a real boundary, point the config directory at one that holds only
  the intended account's credentials.

### Managing accounts

| Command | Does |
| --- | --- |
| `auth login [--account <name>]` | Add or re-authenticate an account |
| `auth use <name>` | Set the default |
| `auth accounts` / `accounts` | List them, with state and which is default |
| `auth status` | Show the resolved account and where it came from |
| `auth logout <name>` | Remove credentials. With 2+ accounts the name is required. |
| `account remove <name> --confirm <name>` | Delete an account and its data |

- Logging out or removing takes an explicit target once there are several accounts. Acting on
  "the default" for a destructive command is how the wrong one gets removed.
- Removing an account that holds local data (history, caches, a daemon) is destructive and
  takes `--confirm <name>` (see `mutations.md`).
- Adding an account that exists is a no-op that says so.

### Per-account state

Everything that belongs to an account lives under that account's directory: tokens, caches,
preferences, and any daemon socket or database. A tool with a background daemon runs one per
account, so accounts never share a process or a store, and stopping one leaves the others
running.

## Storage layout

```
<config>/<tool>/
  config.json                 # the default account and tool-wide settings
  accounts/<name>/
    token.json                # credentials, 0600
    prefs.json                # non-credential preferences; survives logout
```

- **Config directory:** `$<TOOL>_AXI_CONFIG_DIR`, then `$XDG_CONFIG_HOME/<tool>`, then
  `~/.config/<tool>`. The override exists mainly so tests and sandboxes can redirect it.
- **Cache:** `$XDG_CACHE_HOME/<tool>`. A cache is disposable and can be rebuilt; say so, and
  provide `cache clear`.
- **State and runtime** (databases, sockets): `$XDG_STATE_HOME` and `$XDG_RUNTIME_DIR`.
- **Modes:** directories `0700`, files `0600`. Set the mode explicitly after each write. The
  mode passed at creation only applies when the file is new, and the umask can widen it.
- Credentials and preferences have different lifecycles. Logout removes the token and keeps
  preferences.
- An unreadable or unparseable config is an error, never an empty default (`fail-closed.md`).
- Cache non-secret identity (user name, account id, time zone) at login, so the home view can
  show who is signed in without a network call.
- A daemon that owns sensitive files refuses to start if any of them is a symlink, owned by
  another user, or group- or world-accessible.

Our tools are stateless by default: no daemon, safe to run unattended from cron. A daemon is
justified only when the service requires a persistent connection.

## Environment variables

- **Naming:** `<TOOL>_AXI_<THING>`: `SLACK_AXI_TOKEN`, `NEXUDUS_AXI_SPACE`,
  `GWS_AXI_ACCOUNT`. Where a service has a conventional variable its users already set, accept
  that as well.
- **Tokens for headless use.** Every tool accepts its credential from the environment, and the
  environment wins over stored config. This is what makes cron and CI work.
- **The set is closed.** List every variable the tool reads in the spec. Adding one is a spec
  change.
- **Environment variables pin context. They never enable capability.** A variable may say
  which account to act as or where config lives. It may not turn on a behavior that no flag
  can reach, change the output format, or turn a refusal into a success. An agent inherits its
  environment without seeing it, which makes it the right place for a constraint and the wrong
  place for a capability nobody reviewing the command line could see.
- **Every choice an environment variable makes is echoed** in the output that acted on it.
- An empty or whitespace-only value is unset.
- The one test-only toggle is `<TOOL>_AXI_DISABLE_HOOKS=1`, which makes hook installation a
  no-op (see `home-doctor-hooks.md`).

## Secrets

- **Keep secrets off argv.** Arguments leak into shell history and process listings. Take a
  password or token from exactly one channel: `--password-stdin` (or `--token-stdin`), or an
  environment variable. Read stdin only when the flag asks for it, so the tool never blocks on
  a terminal. Show a portable example in the hint:

  ```
  Run `read -rs P && printf %s "$P" | tool auth login --user me@example.com --password-stdin`
  ```

- If a `--token <value>` flag exists for convenience, the stdin and environment forms are the
  documented default.
- Store the tokens a password is exchanged for, never the password.
- Never print a secret. `config` and `auth status` mask it and report where it came from
  (`env` or `config`).
- Keep message content, contact details and credentials out of logs. Limit third-party
  library logging to warnings and errors when its debug lines carry them.
- Check `npm pack` output for secrets before the first publish.

## Auth commands

- `auth setup` or `auth login` walks the setup. For a multi-step setup (an OAuth client, app
  registration), show progress as `N of M steps complete` with the next step's exact command.
- Auth commands may report hook state read-only. They never install a hook.
- A copy-paste onboarding line helps for tools configured from a web page: one command that
  installs the tool and stores the server and token together (`config set --server … --token …`).
- `config` shows effective values and their source; `config path` prints the file location.
- Token refresh happens once on a 401, persists the new pair, and retries. A failed refresh is
  `TOKEN_EXPIRED` with the login command for that account.
