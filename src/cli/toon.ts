import { encode } from "@toon-format/toon";

/** Render an already-shaped object as TOON. */
export function renderObject(obj: Record<string, unknown>): string {
  return encode(obj);
}

/** Render a labeled collection of plain row objects as a TOON table. */
export function renderList(label: string, items: Record<string, unknown>[]): string {
  return encode({ [label]: items });
}

/**
 * Render a labeled block of free-text lines (help suggestions, warnings). Done
 * by hand rather than via encode() because encode inlines primitive arrays onto
 * one line; agents read these more reliably as an indented block.
 */
export function renderLines(label: string, lines: string[]): string {
  const clean = lines.filter(Boolean);
  if (clean.length === 0) return "";
  return `${label}[${clean.length}]:\n${clean.map((l) => `  ${l}`).join("\n")}`;
}

/** Next-step suggestions block. */
export function renderHelp(lines: string[]): string {
  return renderLines("help", lines);
}

/** Join TOON blocks into a single stdout payload, dropping empties. */
export function renderOutput(blocks: string[]): string {
  return blocks.filter(Boolean).join("\n");
}
