import { AxiError } from "axi-sdk-js";

export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

/**
 * Minimal flag parser. Flags are `--name value`, except those listed in
 * `booleanFlags`, which are bare `--name`. Also accepts `--name=value`.
 * Everything else is a positional.
 */
export function parseArgs(args: string[], booleanFlags: string[] = []): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
        continue;
      }
      const name = arg.slice(2);
      if (booleanFlags.includes(name)) {
        flags[name] = true;
      } else {
        const value = args[++i];
        if (value === undefined) {
          throw new AxiError(`Flag --${name} requires a value`, "VALIDATION_ERROR");
        }
        flags[name] = value;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags };
}

/**
 * Resolve the plans directory from `--dir <path>` or the first positional,
 * defaulting to `./plans`. Returns the raw (unresolved) path; callers resolve.
 */
export function plansDirArg(parsed: ParsedArgs): string {
  const dir = parsed.flags.dir;
  if (typeof dir === "string" && dir) return dir;
  return parsed.positionals[0] ?? "./plans";
}
