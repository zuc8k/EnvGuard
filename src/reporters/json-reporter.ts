/**
 * SecretScope — JSON reporter.
 *
 * Serializes the ScanReport as pretty-printed JSON.
 *
 * The ScanReport type already guarantees that no raw secret values
 * are present: secret findings carry maskedValue, not rawValue.
 * This reporter does not add or reveal any fields.
 */

import type { ScanReport } from '../core/types.js';

export interface JsonReporterOptions {
  /**
   * If true, output is compact (no indentation). Defaults to false
   * for readability, which matters in CI logs.
   */
  compact?: boolean;
}

/**
 * Returns the report as a JSON string. Does not write anywhere;
 * the caller decides where to send it.
 */
export function formatJsonReport(
  report: ScanReport,
  options: JsonReporterOptions = {},
): string {
  const indent = options.compact === true ? 0 : 2;
  return JSON.stringify(report, null, indent);
}