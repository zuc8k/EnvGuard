/**
 * SecretScope — Console reporter.
 *
 * Produces a human-readable report as a string. The caller (CLI)
 * decides whether to print it to stdout or to a file.
 *
 * Color handling:
 *   - NO_COLOR set (any value) -> colors disabled
 *   - FORCE_COLOR set (any value) -> colors enabled
 *   - Otherwise -> colors enabled only if stdout is a TTY
 *
 * No dependency on chalk or similar. ANSI codes are inlined to keep
 * the dependency surface minimal for a security-focused tool.
 */

import type { Finding, ScanReport, Severity } from '../core/types.js';

export interface ConsoleReporterOptions {
  /**
   * Override color detection. Useful for tests.
   * If undefined, colors are auto-detected.
   */
  color?: boolean;
  /** If true, only the summary and warnings are printed. */
  quiet?: boolean;
}

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
} as const;

type ColorName = keyof typeof ANSI;

function applyColor(text: string, name: ColorName, enabled: boolean): string {
  if (!enabled) return text;
  return `${ANSI[name]}${text}${ANSI.reset}`;
}

function detectColorOverride(): boolean | undefined {
  if (process.env['NO_COLOR'] !== undefined) return false;
  if (process.env['FORCE_COLOR'] !== undefined) return true;
  if (typeof process.stdout.isTTY === 'boolean') return process.stdout.isTTY;
  return false;
}

function severityIcon(severity: Severity): string {
  switch (severity) {
    case 'error': return '✖';
    case 'warning': return '⚠';
    case 'info': return 'ℹ';
  }
}

function severityColor(severity: Severity): ColorName {
  switch (severity) {
    case 'error': return 'red';
    case 'warning': return 'yellow';
    case 'info': return 'cyan';
  }
}

function formatLocation(finding: Finding): string {
  const loc = finding.location;
  if (!loc) return '';
  const column = loc.column !== undefined ? `:${loc.column}` : '';
  return `${loc.file}:${loc.line}${column}`;
}

/**
 * Returns the report as a formatted string.
 */
export function formatConsoleReport(
  report: ScanReport,
  options: ConsoleReporterOptions = {},
): string {
  const useColor = options.color ?? detectColorOverride() ?? false;
  const quiet = options.quiet === true;
  const lines: string[] = [];

  lines.push(
    `${applyColor('SecretScope', 'bold', useColor)} ` +
      `${applyColor(`v${report.tool.version}`, 'dim', useColor)} ` +
      `${applyColor('— scan report', 'dim', useColor)}`,
  );
  lines.push(`${applyColor('Root:', 'dim', useColor)} ${report.root}`);
  lines.push(
    `${applyColor('Generated:', 'dim', useColor)} ${report.generatedAt}`,
  );
  lines.push('');

  // Summary
  const s = report.summary;
  lines.push(applyColor('Summary', 'bold', useColor));
  lines.push(`  Files scanned:    ${s.filesScanned}`);
  lines.push(`  Env vars found:   ${s.envVarsFound}`);
  lines.push(`  Code refs found:  ${s.codeRefsFound}`);
  const severityBreakdown =
    `${applyColor(`error: ${s.bySeverity.error}`, 'red', useColor)}, ` +
    `${applyColor(`warning: ${s.bySeverity.warning}`, 'yellow', useColor)}, ` +
    `${applyColor(`info: ${s.bySeverity.info}`, 'cyan', useColor)}`;
  lines.push(`  Findings:         ${s.findings} (${severityBreakdown})`);
  lines.push('');

  if (!quiet && report.findings.length > 0) {
    lines.push(applyColor('Findings', 'bold', useColor));
    const grouped = groupByCategory(report.findings);
    for (const [category, findings] of grouped) {
      lines.push('');
      lines.push(`  ${applyColor(category, 'bold', useColor)}`);
      for (const finding of findings) {
        const icon = severityIcon(finding.severity);
        const iconColored = applyColor(icon, severityColor(finding.severity), useColor);
        const loc = formatLocation(finding);
        const maskedSuffix =
          finding.maskedValue !== undefined && finding.maskedValue !== ''
            ? ` ${applyColor(`(${finding.maskedValue})`, 'dim', useColor)}`
            : '';
        lines.push(`    ${iconColored} ${applyColor(finding.ruleId, 'bold', useColor)}${maskedSuffix}`);
        if (loc !== '') {
          lines.push(`      ${applyColor(loc, 'dim', useColor)}`);
        }
        lines.push(`      ${finding.message}`);
      }
    }
    lines.push('');
  }

  if (report.warnings.length > 0) {
    lines.push(applyColor('Warnings', 'bold', useColor));
    for (const warning of report.warnings) {
      lines.push(`  ${applyColor('-', 'yellow', useColor)} ${warning}`);
    }
    lines.push('');
  }

  if (report.findings.length === 0 && report.warnings.length === 0) {
    lines.push(applyColor('No findings. Nothing to report.', 'green', useColor));
    lines.push('');
  }

  // Trailing newline trimmed: CLI adds its own.
  return lines.join('\n').replace(/\n+$/, '');
}

function groupByCategory(
  findings: readonly Finding[],
): Map<string, Finding[]> {
  const map = new Map<string, Finding[]>();
  for (const finding of findings) {
    const list = map.get(finding.category);
    if (list) {
      list.push(finding);
    } else {
      map.set(finding.category, [finding]);
    }
  }
  return map;
}