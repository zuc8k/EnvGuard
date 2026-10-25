/**
 * SecretScope — .env parser.
 *
 * This parser extracts VARIABLE NAMES ONLY. It never stores or returns
 * the values, which is a deliberate design choice: values may contain
 * secrets and must never be retained beyond the read buffer.
 *
 * Supported syntax:
 *   - Comments (# ...)
 *   - `export KEY=value` prefix
 *   - Bare keys without `=` (treated as flag-style keys)
 *   - Empty values (`KEY=`)
 *   - Single-quoted and double-quoted values (multi-line aware)
 *   - Escaped quotes inside double-quoted values
 *   - BOM at file start
 *   - CRLF and lone CR line endings (normalized to \n)
 *
 * Known limitations:
 *   - Single-quoted multi-line values do not support escaping (this
 *     matches the dotenv spec).
 *   - Inline comments after unquoted values are ignored (they contain
 *     no variable names, so it does not affect the output).
 */

import { readTextFile } from '../utils/fs-safe.js';
import type { EnvVarEntry } from '../core/types.js';

/** A conservative env-var name pattern. */
const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/** `export ` prefix (with any amount of spaces after export). */
const EXPORT_PREFIX = /^export\s+/;

export interface EnvParseResult {
  /** Variables found in the file. Never contains values. */
  entries: EnvVarEntry[];
  /** Non-fatal issues encountered while parsing. */
  warnings: string[];
  /** Names that appeared more than once (first occurrence is kept). */
  duplicates: string[];
}

export interface ParseEnvFileOptions {
  /** Maximum number of bytes to read. Defaults to 1 MiB via fs-safe. */
  maxBytes?: number;
}

/**
 * Parses the content of a .env file and returns the variable names.
 * Never returns values. `filePath` is only used for reporting.
 */
export function parseEnvContent(
  content: string,
  filePath: string,
): EnvParseResult {
  const entries: EnvVarEntry[] = [];
  const warnings: string[] = [];
  const duplicates: string[] = [];
  const firstSeenAt = new Map<string, number>();

  // Strip BOM and normalize line endings.
  const clean = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = clean.split('\n');

  let inMultiline: { quote: '"' | "'"; startLine: number } | null = null;
  let i = 0;

  while (i < lines.length) {
    const lineNumber = i + 1;
    const line = lines[i]!;

    // Currently inside a multi-line quoted value: look for the close.
    if (inMultiline !== null) {
      if (findClosingQuoteInLine(line, 0, inMultiline.quote) !== -1) {
        inMultiline = null;
      }
      i++;
      continue;
    }

    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    let body = trimmed;
    if (EXPORT_PREFIX.test(body)) {
      body = body.replace(EXPORT_PREFIX, '');
    }

    const eqIndex = body.indexOf('=');
    const rawName = eqIndex === -1 ? body.trim() : body.slice(0, eqIndex).trim();
    const rawValue = eqIndex === -1 ? '' : body.slice(eqIndex + 1);

    if (!KEY_PATTERN.test(rawName)) {
      warnings.push(
        `Line ${lineNumber}: skipping invalid key "${rawName}" in ${filePath}`,
      );
      i++;
      continue;
    }

    // Detect a quoted value that continues on later lines.
    const trimmedValue = rawValue.trimStart();
    const firstChar = trimmedValue.charAt(0);
    if (firstChar === '"' || firstChar === "'") {
      const closeIndex = findClosingQuoteInLine(trimmedValue, 1, firstChar);
      if (closeIndex === -1) {
        inMultiline = { quote: firstChar, startLine: lineNumber };
      }
    }

    if (firstSeenAt.has(rawName)) {
      if (!duplicates.includes(rawName)) {
        duplicates.push(rawName);
      }
    } else {
      firstSeenAt.set(rawName, lineNumber);
    }

    entries.push({ name: rawName, file: filePath, line: lineNumber });
    i++;
  }

  if (inMultiline !== null) {
    warnings.push(
      `Unterminated quoted value starting near line ${inMultiline.startLine} in ${filePath}`,
    );
  }

  return { entries, warnings, duplicates };
}

/**
 * Scans `text` starting at `startIndex` for a closing quote of the
 * given kind. Returns the index of the closing quote, or -1 if not
 * found on this line. Backslash escapes are honored for double quotes
 * only (matching dotenv semantics).
 */
function findClosingQuoteInLine(
  text: string,
  startIndex: number,
  quote: '"' | "'",
): number {
  let j = startIndex;
  while (j < text.length) {
    const ch = text[j]!;
    if (quote === '"' && ch === '\\') {
      j += 2;
      continue;
    }
    if (ch === quote) return j;
    j++;
  }
  return -1;
}

/**
 * Reads and parses a .env file. Throws only on I/O errors or when the
 * file exceeds `maxBytes` (FileTooLargeError from fs-safe). Parse
 * issues are returned as warnings.
 */
export async function parseEnvFile(
  filePath: string,
  options: ParseEnvFileOptions = {},
): Promise<EnvParseResult> {
  const readOptions =
    options.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {};
  const result = await readTextFile(filePath, readOptions);
  return parseEnvContent(result.content, filePath);
}