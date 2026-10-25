/**
 * SecretScope — Central redaction utilities.
 *
 * Invariant: ANY value that might be a secret MUST pass through
 * `maskValue` before it appears in console output, JSON, SARIF,
 * logs, error messages, or any other destination.
 *
 * Masking policy:
 *   - Empty string            -> empty string
 *   - Shorter than 16 chars   -> fully masked (never reveal any character)
 *   - 16 chars or longer      -> reveal up to 2 chars at the start and
 *                                2 chars at the end, replace the middle
 *                                with exactly 4 asterisks.
 *
 * This means at most 25% of a 16-char secret is revealed, and the
 * revealed fraction decreases as the secret gets longer.
 */

const MASK_CHAR = '*';
const MASK_WIDTH = 4;
const MIN_PARTIAL_LENGTH = 16;
const PEEK_EDGE = 2;

export interface MaskOptions {
  /** Number of leading characters to reveal. Default 2, capped by policy. */
  keepStart?: number;
  /** Number of trailing characters to reveal. Default 2, capped by policy. */
  keepEnd?: number;
}

/**
 * Masks a secret value. The returned string is safe to log.
 */
export function maskValue(value: string, options: MaskOptions = {}): string {
  if (value.length === 0) return '';

  if (value.length < MIN_PARTIAL_LENGTH) {
    return MASK_CHAR.repeat(MASK_WIDTH);
  }

  const keepStart = Math.max(0, Math.min(options.keepStart ?? PEEK_EDGE, PEEK_EDGE));
  const keepEnd = Math.max(0, Math.min(options.keepEnd ?? PEEK_EDGE, PEEK_EDGE));

  if (keepStart === 0 && keepEnd === 0) {
    return MASK_CHAR.repeat(MASK_WIDTH);
  }

  const start = keepStart > 0 ? value.slice(0, keepStart) : '';
  const end = keepEnd > 0 ? value.slice(value.length - keepEnd) : '';
  return `${start}${MASK_CHAR.repeat(MASK_WIDTH)}${end}`;
}

/**
 * Returns the value unchanged if it is already masked, otherwise masks it.
 * Useful for idempotent redaction at the reporter layer.
 */
export function ensureMasked(value: string): string {
  if (isLikelyMasked(value)) return value;
  return maskValue(value);
}

/**
 * Heuristic check: does this string look like the output of maskValue?
 * A masked value contains exactly `MASK_WIDTH` consecutive asterisks.
 */
export function isLikelyMasked(value: string): boolean {
  return value.includes(MASK_CHAR.repeat(MASK_WIDTH));
}

/**
 * Redacts every occurrence of any known secret inside a free-form text
 * (typically an error message or a log line). Does not modify the
 * caller's secrets, does not throw on missing entries.
 */
export function redactText(text: string, secrets: Iterable<string>): string {
  const unique = new Set<string>();
  for (const s of secrets) {
    if (typeof s === 'string' && s.length >= 4) {
      unique.add(s);
    }
  }
  if (unique.size === 0) return text;

  // Replace longest first so a shorter secret nested in a longer one
  // does not corrupt the masking of the longer one.
  const ordered = [...unique].sort((a, b) => b.length - a.length);
  let result = text;
  for (const secret of ordered) {
    result = result.split(secret).join(maskValue(secret));
  }
  return result;
}