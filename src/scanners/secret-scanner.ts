/**
 * SecretScope — Secret scanner.
 *
 * Applies SecretRules to file content and produces Finding objects.
 *
 * Hard invariants:
 *   - The matched secret value is passed through maskValue() BEFORE
 *     being placed in any Finding field.
 *   - The `snippet` field is intentionally omitted from secret
 *     findings, because a snippet would contain (even if masked) a
 *     portion of the secret in a place users might copy/paste.
 *   - The raw content is not retained after scanning.
 */

import type { Finding, SecretRule } from '../core/types.js';
import { maskValue } from '../core/redactor.js';
import { FileTooLargeError, readTextFile } from '../utils/fs-safe.js';
import { toRelativePath } from '../utils/fs-safe.js';
import { SECRET_RULES, rulesApplicableToPath } from '../rules/secrets.js';

export interface SecretScannerOptions {
  /** Project root, used to render relative paths in reports. */
  root: string;
  /** Override the default rule set. */
  rules?: readonly SecretRule[];
  /** Maximum size of a single file to scan. Defaults to fs-safe default (1 MiB). */
  maxBytes?: number;
}

export interface SecretScanResult {
  findings: Finding[];
  warnings: string[];
  /** Number of rules that produced at least one match. */
  rulesHit: number;
}

export class SecretScanner {
  private readonly root: string;
  private readonly rules: readonly SecretRule[];
  private readonly maxBytes: number | undefined;

  constructor(options: SecretScannerOptions) {
    this.root = options.root;
    this.rules = options.rules ?? SECRET_RULES;
    this.maxBytes = options.maxBytes;
  }

  /**
   * Scans a single file. Reads via fs-safe so size limits and
   * encoding are consistent with other scanners.
   */
  async scanFile(filePath: string): Promise<SecretScanResult> {
    const displayPath = toRelativePath(this.root, filePath);

    let content: string;
    try {
      const readOptions =
        this.maxBytes !== undefined ? { maxBytes: this.maxBytes } : {};
      const result = await readTextFile(filePath, readOptions);
      content = result.content;
    } catch (err) {
      if (err instanceof FileTooLargeError) {
        return {
          findings: [],
          warnings: [`Skipped (too large) ${displayPath}: ${err.size} bytes`],
          rulesHit: 0,
        };
      }
      return {
        findings: [],
        warnings: [
          `Failed to read ${displayPath}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ],
        rulesHit: 0,
      };
    }

    return this.scanContent(content, displayPath);
  }

  /**
   * Scans already-read content. Exposed for tests and for callers
   * that want to reuse the file content across scanners.
   */
  scanContent(content: string, displayPath: string): SecretScanResult {
    const lineStarts = computeLineStarts(content);
    const applicable = rulesApplicableToPath(this.rules, displayPath);
    const findings: Finding[] = [];
    const warnings: string[] = [];
    const hitRuleIds = new Set<string>();

    for (const rule of applicable) {
      // Fresh regex per file: guarantees no lastIndex state leaks.
      const regex = new RegExp(rule.pattern.source, rule.pattern.flags);

      for (const match of content.matchAll(regex)) {
        const index = match.index;
        if (index === undefined) continue;

        const value = extractValue(match, rule);
        if (value === undefined || value.length === 0) {
          warnings.push(
            `Rule ${rule.id} matched empty value in ${displayPath}; skipped.`,
          );
          continue;
        }

        const { line, column } = offsetToLocation(lineStarts, index);
        hitRuleIds.add(rule.id);

        findings.push({
          ruleId: rule.id,
          category: 'secret-pattern',
          severity: rule.severity,
          message: `Detected possible ${rule.description}.`,
          location: {
            file: displayPath,
            line,
            column,
            // Intentionally NO snippet: it could contain the secret.
          },
          // Mandatory: mask BEFORE putting the value anywhere.
          maskedValue: maskValue(value),
          metadata: {
            matchedLength: value.length,
          },
        });
      }
    }

    return { findings, warnings, rulesHit: hitRuleIds.size };
  }
}

/**
 * Extracts the secret value from a regex match using the rule's
 * `valueGroup` (defaults to the full match).
 */
function extractValue(
  match: RegExpMatchArray,
  rule: SecretRule,
): string | undefined {
  const group = rule.valueGroup ?? 0;
  return match[group];
}

/**
 * Precomputes the byte offset at which each line starts.
 * The first element is always 0 (line 1 starts at offset 0).
 */
function computeLineStarts(content: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

/**
 * Binary search for the line containing `index`, then computes a
 * 1-based line and column.
 */
function offsetToLocation(
  lineStarts: number[],
  index: number,
): { line: number; column: number } {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const value = lineStarts[mid];
    if (value !== undefined && value <= index) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  const lineStart = lineStarts[lo] ?? 0;
  return { line: lo + 1, column: index - lineStart + 1 };
}