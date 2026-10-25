/**
 * SecretScope — .env.example fixer.
 *
 * Proposes (and optionally applies) additions to an existing
 * `.env.example` file. Never touches `.env`, `.gitignore`, or Git.
 *
 * Safety model:
 *   - The caller must pass `apply: true` explicitly. The CLI only
 *     does so when both `--fix` and `--yes` are present.
 *   - If the target file does not exist, this module does NOT create
 *     it. It returns a proposal instead, and the CLI prints it.
 *   - Variables already present in the file are never re-added.
 *   - The original content is preserved verbatim; additions are
 *     appended as a clearly marked block with exactly one blank line
 *     separator before the marker.
 */

/** A single proposed addition. */
export interface FixProposal {
  /** Variables that will be (or would be) added. */
  added: string[];
  /** The full updated content, if `apply` is true. Empty otherwise. */
  updatedContent: string;
  /** Whether the change was actually written to disk. */
  applied: boolean;
  /** Non-fatal warnings. */
  warnings: string[];
}

export interface FixOptions {
  /** Absolute or root-relative path to `.env.example`. */
  examplePath: string;
  /** Current content of `.env.example`. */
  existingContent: string;
  /** Variables that should be added (from undocumented findings). */
  missingVars: readonly string[];
  /** Whether to write the file. The CLI sets this only with --yes. */
  apply: boolean;
}

/** Marker prepended to the section added by --fix. */
export const FIX_SECTION_MARKER = '# Added by secretscope --fix';

/** Regex to detect a variable name at the start of a line. */
const LINE_VAR_PATTERN = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*(?:=|$)/;

/**
 * Returns the set of variable names already declared in the content.
 * This is intentionally a simple regex, not a full parse, because we
 * only need a conservative "already mentioned?" check.
 */
export function collectExistingNames(content: string): Set<string> {
  const names = new Set<string>();
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  for (const line of normalized.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const match = LINE_VAR_PATTERN.exec(line);
    if (match && match[1]) {
      names.add(match[1]);
    }
  }
  return names;
}

/**
 * Builds the new content by appending missing variables as a
 * clearly marked block. Preserves the original text verbatim,
 * including line endings.
 *
 * Layout (for a non-empty existing file):
 *   <existing, trailing whitespace trimmed>
 *   <blank line>
 *   # Added by secretscope --fix
 *   VAR1=
 *   VAR2=
 *   <trailing newline>
 *
 * For an empty existing file, no leading blank lines are emitted.
 */
export function buildUpdatedContent(
  existingContent: string,
  varsToAdd: readonly string[],
): string {
  if (varsToAdd.length === 0) return existingContent;

  const useCrlf = existingContent.includes('\r\n');
  const newline = useCrlf ? '\r\n' : '\n';

  const sectionLines = [
    FIX_SECTION_MARKER,
    ...varsToAdd.map((name) => `${name}=`),
  ];
  const section = sectionLines.join(newline);

  const trimmedEnd = existingContent.replace(/\s+$/, '');
  if (trimmedEnd === '') {
    return `${section}${newline}`;
  }
  return `${trimmedEnd}${newline}${newline}${section}${newline}`;
}

/**
 * Computes the fix proposal. Does not write anything unless
 * `apply` is true.
 */
export function proposeFix(options: FixOptions): FixProposal {
  const warnings: string[] = [];
  const existing = collectExistingNames(options.existingContent);

  // Preserve caller order, dedupe, and drop anything already present.
  const toAdd: string[] = [];
  const seen = new Set<string>();
  for (const name of options.missingVars) {
    if (!isValidVarName(name)) {
      warnings.push(`Skipping invalid variable name: ${JSON.stringify(name)}`);
      continue;
    }
    if (existing.has(name) || seen.has(name)) continue;
    seen.add(name);
    toAdd.push(name);
  }

  if (toAdd.length === 0) {
    return {
      added: [],
      updatedContent: '',
      applied: false,
      warnings,
    };
  }

  const updatedContent = buildUpdatedContent(options.existingContent, toAdd);

  return {
    added: toAdd,
    updatedContent,
    applied: options.apply,
    warnings,
  };
}

function isValidVarName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name) && name.length <= 200;
}