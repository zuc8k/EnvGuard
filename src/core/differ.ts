/**
 * SecretScope — Environment variable differ.
 *
 * Pure comparison logic: takes already-parsed inputs and produces
 * classified findings. Reads no files, writes no files, and has
 * no side effects.
 *
 * Classification:
 *   missing-env-var        Code reads X, but no .env file defines X.
 *   unused-env-var         A .env file defines X, but no code reads X.
 *   undocumented-env-var   A .env file defines X, but .env.example
 *                          does not mention X.
 *
 * Ordering: findings are emitted grouped by category and, within
 * each category, sorted by variable name for deterministic output.
 */

import type {
  CodeReference,
  EnvVarEntry,
  Finding,
} from './types.js';

export interface DifferInput {
  /** Entries from the actual .env file(s). Should NOT include .env.example. */
  envEntries: readonly EnvVarEntry[];
  /** Entries from .env.example (or .env.sample / .env.template). */
  envExampleEntries: readonly EnvVarEntry[];
  /** References extracted from source code. */
  codeReferences: readonly CodeReference[];
}

export interface DifferResult {
  findings: Finding[];
  /** Per-category counts, useful for the summary. */
  counts: {
    missing: number;
    unused: number;
    undocumented: number;
  };
}

/**
 * Compares the three inputs and returns classified findings.
 * Duplicate definitions are not merged here: if `X` appears twice in
 * `.env`, it appears once in the `missing`/`undocumented` analysis
 * but the parser separately reports the duplicate. This function
 * only cares about set membership.
 */
export function compareEnvironment(input: DifferInput): DifferResult {
  const envNames = firstByVarName(input.envEntries);
  const exampleNames = new Set(input.envExampleEntries.map((e) => e.name));
  const codeNames = groupCodeRefsByName(input.codeReferences);

  const findings: Finding[] = [];

  // 1. missing-env-var: code reads X, .env does not define X.
  const missingNames = [...codeNames.keys()]
    .filter((name) => !envNames.has(name))
    .sort();
  for (const name of missingNames) {
    const refs = codeNames.get(name);
    if (!refs || refs.length === 0) continue;
    const first = refs[0]!;
    const referencedFiles = uniqueFiles(refs);
    findings.push({
      ruleId: 'ENV_VAR_MISSING',
      category: 'missing-env-var',
      severity: 'warning',
      message:
        `Environment variable ${name} is read in code but not defined ` +
        `in any .env file. If it is provided by the shell or CI, you ` +
        `can document it in .env.example.`,
      location: {
        file: first.file,
        line: first.line,
        ...(first.column !== undefined ? { column: first.column } : {}),
      },
      metadata: {
        referenceCount: refs.length,
        referencedIn: referencedFiles.join(', '),
      },
    });
  }

  // 2. unused-env-var: .env defines X, no code reads X.
  const unusedNames = [...envNames.keys()]
    .filter((name) => !codeNames.has(name))
    .sort();
  for (const name of unusedNames) {
    const entry = envNames.get(name);
    if (!entry) continue;
    findings.push({
      ruleId: 'ENV_VAR_UNUSED',
      category: 'unused-env-var',
      severity: 'warning',
      message:
        `Environment variable ${name} is defined in ${entry.file} but ` +
        `not referenced in any analyzed source file. Remove it, or ` +
        `verify whether it is used by external tooling.`,
      location: {
        file: entry.file,
        line: entry.line ?? 1,
      },
    });
  }

  // 3. undocumented-env-var: .env defines X, .env.example does not.
  const undocumentedNames = [...envNames.keys()]
    .filter((name) => !exampleNames.has(name))
    .sort();
  for (const name of undocumentedNames) {
    const entry = envNames.get(name);
    if (!entry) continue;
    findings.push({
      ruleId: 'ENV_VAR_UNDOCUMENTED',
      category: 'undocumented-env-var',
      severity: 'warning',
      message:
        `Environment variable ${name} is defined in ${entry.file} but ` +
        `missing from .env.example. Add it to .env.example so new ` +
        `contributors know it is required.`,
      location: {
        file: entry.file,
        line: entry.line ?? 1,
      },
    });
  }

  return {
    findings,
    counts: {
      missing: missingNames.length,
      unused: unusedNames.length,
      undocumented: undocumentedNames.length,
    },
  };
}

/** Keeps the first occurrence for each variable name. */
function firstByVarName(entries: readonly EnvVarEntry[]): Map<string, EnvVarEntry> {
  const map = new Map<string, EnvVarEntry>();
  for (const entry of entries) {
    if (!map.has(entry.name)) {
      map.set(entry.name, entry);
    }
  }
  return map;
}

/** Groups code references by variable name, preserving order. */
function groupCodeRefsByName(
  refs: readonly CodeReference[],
): Map<string, CodeReference[]> {
  const map = new Map<string, CodeReference[]>();
  for (const ref of refs) {
    const list = map.get(ref.name);
    if (list) {
      list.push(ref);
    } else {
      map.set(ref.name, [ref]);
    }
  }
  return map;
}

/** Returns the unique file paths from a set of references, sorted. */
function uniqueFiles(refs: readonly CodeReference[]): string[] {
  return [...new Set(refs.map((r) => r.file))].sort();
}