# Lean home vs live dashboard

The upstream `axi` skill says the no-args home view should show **content, not a usage manual**
(§8). When your CLI ships as a skill with a SessionStart hook, that principle splits into two
distinct surfaces, because the hook loads on *every* session and must stay cheap. Getting this
split right is item #6 in [kunchenguid/axi#46](https://github.com/kunchenguid/axi/issues/46).

## The two surfaces

| | **home** (no-args) | **dashboard** |
|---|---|---|
| Contains | identity / auth status + command reference | live situational state |
| Cost | cheap — local reads or a single never-error identity call | real data fetch, possibly several sections |
| Live data? | none, or a small bounded amount that is cheap to read | **yes** |
| Default hook | user scope, every session | on-demand, or **project-scoped** hook |
| Resilience | must never error (exit 0 even offline) | may error normally |

The split resolves the tension in `axi` §7 (session-start context must be ruthlessly minimal): the
*minimal* thing (home) is the always-on user-scope default; the *comprehensive* thing (dashboard) is a
deliberate, on-demand or project-pinned opt-in. You don't need a `--compact` middle ground.

This split is a choice per tool, not a rule. Upstream `axi` §8 wants the no-args view to show live
content, and upstream has declined to make an identity-only home a principle. For many tools the
home view **is** live content and is cheap (specops' home is the plans dashboard — pure local file
reads; a time tracker's home is today's entries from one call). In that case keep it in home, and
home and dashboard can be the same thing. Split them when "live state" means several network
calls, work that grows with the account, or content that only matters in some repos.

Whichever you choose, home has to be safe to run in every session: bounded content, a short
timeout on anything live, and a failed read shown as unavailable instead of as an error or as
"nothing there".

## home: identity + reference, offline-safe

The home view is the user-scope every-session payload, so:

- Lead with the identity header the `axi` SDK prepends (`bin:` / `description:`).
- Show **auth/config status**, resolved from a single never-error call (or local config). If the
  server is unreachable or unconfigured, render a status line + a "run `mytool config set …`"
  hint and **exit 0** — an erroring SessionStart hook is worse than a degraded one.
- Carry the command reference (from `COMMAND_GROUPS`) so the agent learns the surface once per
  session. (If you decide the reference belongs only in `--help`, then home carries just identity +
  a couple of next-step hints — that's a fine choice too, and lighter.)
- **No expensive live data.** If you have split out a dashboard, open sessions, current items and
  counts belong there. If you haven't, keep what home shows small, bounded and cheap.

## dashboard: comprehensive coverage, bounded depth

The dashboard is the rich view. Whether personal or entity-focused, the same discipline applies:

- **Comprehensive in coverage, bounded in depth.** Show every relevant section, but cap each one
  (top-N + truncation + a drill-down pointer). A session-start payload that dumps everything blows
  the token budget every session; one that's too thin makes the agent issue follow-up calls.
- **Order sections by ambient value.** Put the most orienting information first — identity, then
  the identifiers the agent will need before it asks (recently-touched entities, slugs), then
  open/overdue items, then activity, then broader context. The tail is what gets cut when context
  is trimmed, so the head must carry the orientation.
- **Hand the agent identifiers up front.** A short list of `type·name·slug` for things the user
  recently touched is a huge head-start — the agent can act without a discovery round trip.
- **Drop redundant columns per surface.** A personal dashboard omits `assignee` (all yours); an
  entity dashboard keeps it. Don't reuse one schema across surfaces where a column is constant.
- **One call, server-side personalization.** Fold "where you left off" into the data endpoint
  (it already knows the user); don't reconstruct it with extra CLI round trips. Thin client,
  server authoritative — the web UI then gets the same view for free.

## Personal vs entity (extended) dashboards

Two dashboard flavors, both useful as project-level hooks:

- **Personal dashboard** (`dashboard`, no args): the team-member's situational awareness — *your*
  overdue/upcoming commitments, *your* recent activity, active projects, pipeline. Scope items to
  the current user.
- **Entity / extended dashboard** (`dashboard <type:slug>… [--related]`): blends specific
  entities into a focused view for a repo whose work is *about* those entities. Merged open items
  across the focal set, a merged chronological feed, and the related-entity neighborhood
  (`--related` = one-hop FK expansion). This is what you pin as a **project hook** so a repo opens
  oriented to its engagement — see `references/session-hooks.md` for the install command.

## How the two stack at the project level

Because Claude Code runs SessionStart hooks from both user and project settings additively, a
session in a project-hooked repo receives **home (user scope) + dashboard (project)** together. Design
the dashboard payload to *omit* the command reference, since the user-scope home already injected it
that session. The two are complementary by construction, not duplicative.
