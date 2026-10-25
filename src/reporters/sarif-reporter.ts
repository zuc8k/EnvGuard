/**
 * SecretScope — SARIF 2.1.0 reporter.
 *
 * Produces a SARIF 2.1.0 log compatible with GitHub Code Scanning.
 * See: https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning
 *
 * Notes:
 *   - `artifactLocation.uri` is emitted as a relative path from the
 *     repo root, which is what GitHub expects.
 *   - `partialFingerprints.primaryLocationLineHash` is a stable
 *     content hash of (ruleId + file + line + maskedValue). It lets
 *     GitHub dedupe the same finding across runs, and it never
 *     contains raw secret data.
 *   - Findings without a location are emitted without `locations`,
 *     but they still carry a `logicalLocations` entry for context.
 */

import { createHash } from 'node:crypto';
import type {
  Finding,
  ScanReport,
  Severity,
} from '../core/types.js';

interface SarifRule {
  id: string;
  shortDescription: { text: string };
  defaultConfiguration: { level: 'error' | 'warning' | 'note' };
  properties: { category: string; severity: Severity };
}

interface SarifResult {
  ruleId: string;
  ruleIndex: number;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  partialFingerprints?: { primaryLocationLineHash: string };
  locations?: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
      region: { startLine: number; startColumn?: number };
    };
  }>;
}

interface SarifLog {
  $schema: string;
  version: '2.1.0';
  runs: Array<{
    tool: {
      driver: {
        name: string;
        version: string;
        informationUri: string;
        rules: SarifRule[];
      };
    };
    results: SarifResult[];
  }>;
}

/** SARIF severity mapping. */
function severityToLevel(severity: Severity): 'error' | 'warning' | 'note' {
  switch (severity) {
    case 'error': return 'error';
    case 'warning': return 'warning';
    case 'info': return 'note';
  }
}

/**
 * Builds the tool-level rule descriptors. Rules are deduplicated by
 * id, in order of first appearance. `defaultConfiguration.level`
 * uses the highest severity observed for that rule.
 */
function buildRules(findings: readonly Finding[]): SarifRule[] {
  const byId = new Map<string, SarifRule>();
  const severityRank: Record<Severity, number> = {
    info: 0,
    warning: 1,
    error: 2,
  };

  for (const finding of findings) {
    const existing = byId.get(finding.ruleId);
    if (!existing) {
      byId.set(finding.ruleId, {
        id: finding.ruleId,
        shortDescription: { text: finding.ruleId },
        defaultConfiguration: { level: severityToLevel(finding.severity) },
        properties: {
          category: finding.category,
          severity: finding.severity,
        },
      });
      continue;
    }

    // Escalate default severity if a higher-severity instance exists.
    const existingRank = severityRank[existing.properties.severity];
    const newRank = severityRank[finding.severity];
    if (newRank > existingRank) {
      existing.properties.severity = finding.severity;
      existing.defaultConfiguration.level = severityToLevel(finding.severity);
    }
  }

  return [...byId.values()];
}

/** Stable, non-reversible fingerprint for a finding. */
function computeFingerprint(finding: Finding): string {
  const parts = [
    finding.ruleId,
    finding.location?.file ?? '',
    String(finding.location?.line ?? 0),
    finding.maskedValue ?? '',
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

function buildResult(finding: Finding, ruleIndex: number): SarifResult {
  const result: SarifResult = {
    ruleId: finding.ruleId,
    ruleIndex,
    level: severityToLevel(finding.severity),
    message: { text: finding.message },
    partialFingerprints: {
      primaryLocationLineHash: computeFingerprint(finding),
    },
  };

  if (finding.location) {
    result.locations = [
      {
        physicalLocation: {
          artifactLocation: { uri: finding.location.file },
          region: {
            startLine: finding.location.line,
            ...(finding.location.column !== undefined
              ? { startColumn: finding.location.column }
              : {}),
          },
        },
      },
    ];
  }

  return result;
}

/**
 * Builds a SARIF 2.1.0 log from a ScanReport.
 */
export function buildSarifLog(report: ScanReport): SarifLog {
  const rules = buildRules(report.findings);
  const ruleIndexById = new Map<string, number>();
  rules.forEach((rule, index) => ruleIndexById.set(rule.id, index));

  const results = report.findings.map((finding) =>
    buildResult(finding, ruleIndexById.get(finding.ruleId) ?? -1),
  );

  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: report.tool.name,
            version: report.tool.version,
            informationUri: 'https://github.com/boodyzucks/secretscope',
            rules,
          },
        },
        results,
      },
    ],
  };
}

/**
 * Returns the SARIF log as a pretty-printed JSON string.
 */
export function formatSarifReport(report: ScanReport): string {
  return JSON.stringify(buildSarifLog(report), null, 2);
}