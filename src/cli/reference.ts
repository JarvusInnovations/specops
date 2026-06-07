/**
 * Single source of truth for the CLI's identity and command catalog. The home
 * view and the generated SKILL.md command-reference region both derive from
 * COMMAND_GROUPS, so the skill doc can never drift from the implementation.
 */

export const DESCRIPTION =
  "Query the SpecOps plans DAG for the current repo — what's ready to work on, what's blocked, and the dependency graph. A thin determinism layer over a files-first plans/ workflow.";

export interface CommandRef {
  usage: string;
  summary: string;
}

export interface CommandGroup {
  group: string;
  commands: CommandRef[];
}

export const COMMAND_GROUPS: CommandGroup[] = [
  {
    group: "Plans",
    commands: [
      {
        usage: "next [--include-in-progress] [--slugs-only] [--dir <path>]",
        summary: "Plans ordered by readiness — ready (deps met, nothing awaited) first, then awaiting-external and blocked, with what unblocks the most work on top.",
      },
      {
        usage: "dag [--direction TB|LR|BT|RL] [--fence] [--include-cancelled] [--dir <path>]",
        summary: "Mermaid graph of the plans DAG, nodes styled by status, external blockers dashed.",
      },
    ],
  },
  {
    group: "Session",
    commands: [
      {
        usage: "hook install [--scope project|global] [--dir <path>] | hook status | hook uninstall [--scope project|global]",
        summary: "Manage the SessionStart hook that loads this repo's plans dashboard at the start of every agent session.",
      },
    ],
  },
];
