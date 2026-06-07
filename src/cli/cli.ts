import { runAxiCli, type AxiCliCommand } from "axi-sdk-js";
import { DESCRIPTION } from "./reference.js";
import { homeCommand } from "./commands/home.js";
import { nextCommand, NEXT_HELP } from "./commands/next.js";
import { dagCommand, DAG_HELP } from "./commands/dag.js";
import { hookCommand_, HOOK_HELP } from "./commands/hook.js";

// Injected at build time by scripts/build-cli.ts (from `git describe`).
declare const __SPECOPS_VERSION__: string;
const VERSION = typeof __SPECOPS_VERSION__ === "string" ? __SPECOPS_VERSION__ : "dev";

const TOP_HELP = `usage: specops [command] [args] [flags]

commands:
  (none)=home dashboard for the current repo's plans
  next        plans ordered by readiness (ready / awaiting / blocked)
  dag         Mermaid graph of the plans DAG
  hook        manage the SessionStart plans-dashboard hook

flags: --help, -v/--version, --dir <path> (plans dir; default ./plans)

specops reads the plans/ directory of the current repo. It is a thin determinism
layer over a files-first workflow — it computes readiness, ordering, the DAG, and
hygiene warnings across all plan files; to read a single plan, open its file.

examples:
  specops
  specops next --include-in-progress
  specops dag --fence --direction LR
  specops hook install
`;

const COMMAND_HELP: Record<string, string> = {
  next: NEXT_HELP,
  dag: DAG_HELP,
  hook: HOOK_HELP,
};

const COMMANDS: Record<string, AxiCliCommand<undefined>> = {
  next: nextCommand,
  dag: dagCommand,
  hook: hookCommand_,
};

export async function main(argv?: string[]): Promise<void> {
  await runAxiCli<undefined>({
    description: DESCRIPTION,
    version: VERSION,
    ...(argv ? { argv } : {}),
    topLevelHelp: TOP_HELP,
    home: homeCommand,
    commands: COMMANDS,
    getCommandHelp: (command) => COMMAND_HELP[command],
    // Hooks are managed explicitly via the `hook` command. The SDK's auto-install
    // is a no-op for a `.mjs`-named bundle (it only infers from `dist/bin/<name>.js`
    // or an extension-less binary), so no `hooks: false` is needed here.
  });
}
