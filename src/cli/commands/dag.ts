import { AxiError } from "axi-sdk-js";
import { parseArgs } from "../args.js";
import { loadPlans, plansDirExists, type Plan } from "../plans.js";
import { renderObject, renderLines, renderHelp, renderOutput } from "../toon.js";
import { cliInvocation } from "../invocation.js";
import { resolvePlansDir, collapseHome } from "./common.js";

export const DAG_HELP = `usage: specops dag [plans-dir] [flags]

Emit a Mermaid graph of the plans DAG, nodes styled by status:
  planned light gray · in-progress amber · done green (PR # appended) ·
  blocked red · cancelled dashed gray (hidden unless --include-cancelled).
Plans with non-empty awaits: get a dashed border. Edges follow depends:.

flags:
  --dir <path>             plans directory (default ./plans; also positional)
  --direction TB|LR|BT|RL  graph direction (default TB)
  --fence                  wrap output in a \`\`\`mermaid fence
  --include-cancelled      render cancelled nodes
  --help

examples:
  specops dag --fence
  specops dag --direction LR`;

const DIRECTIONS = ["TB", "LR", "BT", "RL"];

function nodeId(slug: string): string {
  return slug.replace(/[^A-Za-z0-9_]/g, "_");
}

function nodeShape(plan: Plan): string {
  const id = nodeId(plan.slug);
  let label = plan.slug;
  if (plan.status === "done" && plan.pr) label += `<br/>PR #${plan.pr}`;
  label = label.replace(/"/g, "&quot;");
  if (plan.status === "blocked") return `${id}(["${label}"])`; // stadium
  if (plan.status === "cancelled") return `${id}["${label}"]`; // rectangle (dashed via classDef)
  return `${id}("${label}")`; // rounded
}

function statusClass(status: string): string {
  switch (status) {
    case "planned":
      return "planned";
    case "in-progress":
      return "inProgress";
    case "done":
      return "done";
    case "blocked":
      return "blocked";
    case "cancelled":
      return "cancelled";
    default:
      return "unknown";
  }
}

function renderMermaid(plans: Map<string, Plan>, direction: string, includeCancelled: boolean): string {
  const lines: string[] = [`graph ${direction}`];

  const shown = new Map<string, Plan>();
  for (const plan of plans.values()) {
    if (plan.status === "cancelled" && !includeCancelled) continue;
    shown.set(plan.slug, plan);
    lines.push(`  ${nodeShape(plan)}`);
  }
  for (const plan of shown.values()) {
    for (const dep of plan.depends) {
      if (!shown.has(dep)) continue;
      lines.push(`  ${nodeId(dep)} --> ${nodeId(plan.slug)}`);
    }
  }
  lines.push("");
  lines.push("  classDef planned fill:#f3f4f6,stroke:#9ca3af,color:#111827");
  lines.push("  classDef inProgress fill:#fef3c7,stroke:#d97706,color:#78350f");
  lines.push("  classDef done fill:#d1fae5,stroke:#059669,color:#064e3b");
  lines.push("  classDef blocked fill:#fee2e2,stroke:#dc2626,color:#7f1d1d");
  lines.push("  classDef cancelled fill:#e5e7eb,stroke:#9ca3af,color:#6b7280,stroke-dasharray:5 5");
  lines.push("  classDef awaits stroke-dasharray:3 3,stroke-width:2px");
  for (const plan of shown.values()) {
    lines.push(`  class ${nodeId(plan.slug)} ${statusClass(plan.status)}`);
    if (plan.awaits.length > 0) {
      lines.push(`  class ${nodeId(plan.slug)} awaits`);
    }
  }
  return lines.join("\n") + "\n";
}

export async function dagCommand(args: string[]): Promise<string> {
  const parsed = parseArgs(args, ["fence", "include-cancelled"]);
  const direction = typeof parsed.flags.direction === "string" ? parsed.flags.direction : "TB";
  if (!DIRECTIONS.includes(direction)) {
    throw new AxiError(`--direction must be one of ${DIRECTIONS.join(", ")} (got ${direction})`, "VALIDATION_ERROR", [
      "specops dag --direction LR",
    ]);
  }
  const dir = resolvePlansDir(parsed);
  const cli = cliInvocation();

  if (!plansDirExists(dir)) {
    return renderOutput([
      renderObject({ plans: `no plans/ directory at ${collapseHome(dir)}` }),
      renderHelp([`Run \`${cli} --help\` for usage`]),
    ]);
  }

  const { plans, warnings } = loadPlans(dir);
  if (plans.size === 0) {
    return renderObject({ plans: `0 plan files in ${collapseHome(dir)} — nothing to graph` });
  }

  const body = renderMermaid(plans, direction, parsed.flags["include-cancelled"] === true);
  const diagram = parsed.flags.fence ? "```mermaid\n" + body + "```" : body.replace(/\n$/, "");

  // Warnings are about plan hygiene, not the diagram — emit them after it so the
  // Mermaid block stays clean to copy, but the agent still sees them (AXI: stdout).
  return renderOutput([diagram, renderLines("warnings", warnings)]);
}
