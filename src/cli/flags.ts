import { AxiError } from "axi-sdk-js";

/**
 * Strict flag parser: anything a command did not declare fails loud instead of
 * being dropped. `parseArgs` in args.ts is the older lenient parser the
 * read-only commands still use; new commands go through this one.
 *
 * Every rejection is a VALIDATION_ERROR, the one code the SDK maps to exit 2.
 */
export interface FlagSpec {
  /** Flags that take a value: `--scope user` or `--scope=user`. */
  value?: string[];
  /** Bare switches. */
  boolean?: string[];
  /** Renamed, removed or commonly guessed flag (as typed, e.g. `--global`) → targeted hint. */
  deprecated?: Record<string, string>;
}

export interface ParsedFlags {
  positionals: string[];
  flags: Record<string, string | true>;
}

const FLAG_START = /^--?[A-Za-z]/;

export function parseFlags(command: string, argv: string[], spec: FlagSpec): ParsedFlags {
  const valueFlags = spec.value ?? [];
  const booleanFlags = spec.boolean ?? [];
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    // Only `-<letter>` / `--<letter>` starts a flag; `-5`, `-` and `---` are text.
    if (!FLAG_START.test(arg)) {
      positionals.push(arg);
      continue;
    }

    const eq = arg.indexOf("=");
    const typed = eq === -1 ? arg : arg.slice(0, eq);
    const name = typed.startsWith("--") ? typed.slice(2) : undefined;
    const isValue = name !== undefined && valueFlags.includes(name);
    const isBoolean = name !== undefined && booleanFlags.includes(name);

    if (!isValue && !isBoolean) {
      const hint = spec.deprecated?.[typed];
      throw new AxiError(`Unknown flag \`${typed}\` for \`${command}\``, "VALIDATION_ERROR", [
        hint ?? validFlagsLine(command, spec),
      ]);
    }
    if (name! in flags) {
      throw new AxiError(`Flag --${name} was given more than once`, "VALIDATION_ERROR", [
        validFlagsLine(command, spec),
      ]);
    }
    if (isBoolean) {
      if (eq !== -1) {
        throw new AxiError(`Flag --${name} takes no value`, "VALIDATION_ERROR");
      }
      flags[name!] = true;
      continue;
    }

    let value: string | undefined;
    if (eq !== -1) {
      value = arg.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next !== undefined && !/^--[A-Za-z]/.test(next) && next !== "--") {
        value = next;
        i++;
      }
    }
    if (value === undefined || value === "") {
      throw new AxiError(`Flag --${name} requires a value`, "VALIDATION_ERROR", [
        validFlagsLine(command, spec),
      ]);
    }
    flags[name!] = value;
  }

  return { positionals, flags };
}

export function validFlagsLine(command: string, spec: FlagSpec): string {
  const all = [...(spec.value ?? []).map((f) => `--${f} <value>`), ...(spec.boolean ?? []).map((f) => `--${f}`)];
  return `Valid flags for \`${command}\`: ${all.length ? all.join(", ") : "(none)"} (--help is always allowed)`;
}

/** Quote one argument for display in a copy-pasteable shell hint. */
export function shellQuote(arg: string): string {
  if (/^[A-Za-z0-9_@%+=:,./~-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}
