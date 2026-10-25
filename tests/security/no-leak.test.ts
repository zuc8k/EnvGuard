/**
 * SecretScope — No-leak security test.
 *
 * Hard invariant under test:
 *   The raw value of any detected secret MUST NOT appear in:
 *     - the Finding object (any field),
 *     - the JSON report,
 *     - the SARIF report,
 *     - the console report.
 *
 * If any of these tests fails, the tool is itself a leak and must
 * not be shipped.
 */

import { describe, expect, it } from 'vitest';

import { SecretScanner } from '../../src/scanners/secret-scanner.js';
import { formatConsoleReport } from '../../src/reporters/console-reporter.js';
import { formatJsonReport } from '../../src/reporters/json-reporter.js';
import { formatSarifReport } from '../../src/reporters/sarif-reporter.js';
import type { Finding, ScanReport } from '../../src/core/types.js';

const scanner = new SecretScanner({ root: '/test' });

function buildReport(findings: Finding[]): ScanReport {
  return {
    tool: { name: 'secretscope', version: '0.1.0' },
    generatedAt: '2025-01-01T00:00:00.000Z',
    root: '/test',
    summary: {
      filesScanned: 1,
      envVarsFound: 1,
      codeRefsFound: 0,
      findings: findings.length,
      bySeverity: {
        error: findings.filter((f) => f.severity === 'error').length,
        warning: findings.filter((f) => f.severity === 'warning').length,
        info: findings.filter((f) => f.severity === 'info').length,
      },
    },
    findings,
    warnings: [],
  };
}

interface SecretCase {
  label: string;
  raw: string;
  content: string;
}

const SECRET_CASES: SecretCase[] = [
  {
    label: 'Stripe live key',
    raw: 'sk_live_' + 'a'.repeat(24),
    content: 'STRIPE_KEY=sk_live_' + 'a'.repeat(24),
  },
  {
    label: 'AWS access key',
    raw: 'AKIA' + 'B'.repeat(16),
    content: 'AWS_KEY=AKIA' + 'B'.repeat(16),
  },
  {
    label: 'GitHub PAT',
    raw: 'ghp_' + 'c'.repeat(36),
    content: 'GH_TOKEN=ghp_' + 'c'.repeat(36),
  },
  {
    label: 'OpenAI key',
    raw: 'sk-' + 'd'.repeat(48),
    content: 'OPENAI_KEY=sk-' + 'd'.repeat(48),
  },
  {
    label: 'Private key header',
    raw: '-----BEGIN RSA PRIVATE KEY-----',
    content: '-----BEGIN RSA PRIVATE KEY-----',
  },
];

describe('SecretScanner: raw secrets never appear in Finding', () => {
  for (const c of SECRET_CASES) {
    it(`masks ${c.label}`, () => {
      const result = scanner.scanContent(c.content, 'test.env');
      expect(result.findings.length).toBeGreaterThan(0);

      for (const finding of result.findings) {
        const serialized = JSON.stringify(finding);
        // The raw secret must not appear in ANY field.
        expect(serialized).not.toContain(c.raw);

        // maskedValue must exist, be masked, and not contain the raw.
        expect(finding.maskedValue).toBeDefined();
        if (finding.maskedValue !== undefined) {
          expect(finding.maskedValue).not.toContain(c.raw);
          expect(finding.maskedValue).toMatch(/\*{4}/);
        }

        // Secret findings must NOT include a snippet (it could leak).
        expect(finding.location?.snippet).toBeUndefined();
      }
    });
  }
});

describe('SecretScanner: raw secrets never appear in reports', () => {
  it('JSON report contains no raw secret', () => {
    const raw = 'sk_live_' + 'z'.repeat(24);
    const result = scanner.scanContent(`K=${raw}`, 'test.env');
    const report = buildReport(result.findings);
    const json = formatJsonReport(report);
    expect(json).not.toContain(raw);
  });

  it('SARIF report contains no raw secret', () => {
    const raw = 'ghp_' + 'q'.repeat(36);
    const result = scanner.scanContent(`K=${raw}`, 'test.env');
    const report = buildReport(result.findings);
    const sarif = formatSarifReport(report);
    expect(sarif).not.toContain(raw);
  });

  it('console report contains no raw secret', () => {
    const raw = 'AKIA' + 'M'.repeat(16);
    const result = scanner.scanContent(`K=${raw}`, 'test.env');
    const report = buildReport(result.findings);
    const text = formatConsoleReport(report, { color: false });
    expect(text).not.toContain(raw);
  });
});

describe('SecretScanner: middle of long secrets is not revealed', () => {
  it('only exposes at most 2 chars at each edge', () => {
    const middle = 'secret_middle_content_'.padEnd(30, 'x');
    const raw = 'sk_live_' + middle;
    const result = scanner.scanContent(`K=${raw}`, 'test.env');
    expect(result.findings.length).toBeGreaterThan(0);

    const serialized = JSON.stringify(result.findings);
    // The middle 30-char region must not appear.
    expect(serialized).not.toContain(middle);
    // The distinctive prefix inside the middle must not appear either.
    expect(serialized).not.toContain('secret_middle');
  });
});