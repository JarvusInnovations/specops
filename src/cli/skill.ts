import { COMMAND_GROUPS } from "./reference.js";

/**
 * Generators for the machine-maintained regions of SKILL.md. The methodology
 * prose in SKILL.md is hand-authored and lives outside the markers; this
 * produces only the command reference, derived from the same COMMAND_GROUPS the
 * CLI uses — so the skill can never drift from the implementation.
 *
 * In the skill, the bundled CLI is invoked by its path relative to the skill
 * directory (`scripts/specops`), since the skill may be installed without the
 * binary on PATH.
 */

const SKILL_INVOCATION = "scripts/specops";

export function commandReferenceMarkdown(): string {
  return COMMAND_GROUPS.map((group) => {
    const items = group.commands
      .map((c) => `- \`${SKILL_INVOCATION} ${c.usage}\` — ${c.summary}`)
      .join("\n");
    return `### ${group.group}\n\n${items}`;
  }).join("\n\n");
}

/** Region id → generator. Keys match the `GENERATED: <id>` markers in SKILL.md. */
export const GENERATED_REGIONS: Record<string, () => string> = {
  "command-reference": commandReferenceMarkdown,
};

/**
 * Splice each generated region into the SKILL.md source between its markers:
 *   <!-- BEGIN GENERATED: <id> --> ... <!-- END GENERATED: <id> -->
 * Returns the updated document. Throws if a declared region's markers are
 * missing so drift can't pass silently.
 */
export function spliceGeneratedRegions(doc: string): string {
  let out = doc;
  for (const [id, generate] of Object.entries(GENERATED_REGIONS)) {
    const begin = `<!-- BEGIN GENERATED: ${id} -->`;
    const end = `<!-- END GENERATED: ${id} -->`;
    const pattern = new RegExp(`${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}`);
    if (!pattern.test(out)) {
      throw new Error(`SKILL.md is missing the generated region markers for "${id}"`);
    }
    out = out.replace(pattern, `${begin}\n\n${generate().trim()}\n\n${end}`);
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
