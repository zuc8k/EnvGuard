import { describe, expect, it } from 'vitest';

import { parseEnvContent } from '../../src/scanners/env-parser.js';

describe('parseEnvContent', () => {
  it('parses a simple KEY=value', () => {
    const result = parseEnvContent('API_KEY=abc123', 'test.env');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toEqual({
      name: 'API_KEY',
      file: 'test.env',
      line: 1,
    });
    expect(result.warnings).toEqual([]);
    expect(result.duplicates).toEqual([]);
  });

  it('does not include values in entries', () => {
    const result = parseEnvContent('SECRET=super_secret_value_here', 'test.env');
    const serialized = JSON.stringify(result.entries);
    expect(serialized).not.toContain('super_secret_value_here');
    expect(result.entries[0]).not.toHaveProperty('value');
  });

  it('ignores comments and blank lines', () => {
    const result = parseEnvContent(
      '# top comment\n\n   \nKEY=value\n# another comment',
      'test.env',
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.name).toBe('KEY');
    expect(result.entries[0]?.line).toBe(4);
  });

  it('handles export prefix', () => {
    const result = parseEnvContent('export KEY=value', 'test.env');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.name).toBe('KEY');
  });

  it('handles bare keys without =', () => {
    const result = parseEnvContent('FLAG', 'test.env');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.name).toBe('FLAG');
  });

  it('handles empty values', () => {
    const result = parseEnvContent('KEY=', 'test.env');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.name).toBe('KEY');
  });

  it('handles single and double quoted values', () => {
    const result = parseEnvContent(`A="hello"\nB='world'`, 'test.env');
    expect(result.entries.map((e) => e.name)).toEqual(['A', 'B']);
  });

  it('handles multi-line double-quoted values', () => {
    const content = 'CERT="-----BEGIN\nline2\nline3\n"\nOTHER=x';
    const result = parseEnvContent(content, 'test.env');
    expect(result.entries.map((e) => e.name)).toEqual(['CERT', 'OTHER']);
    expect(result.warnings).toEqual([]);
  });

  it('detects duplicate keys', () => {
    const result = parseEnvContent('KEY=1\nKEY=2', 'test.env');
    expect(result.entries).toHaveLength(2);
    expect(result.duplicates).toEqual(['KEY']);
  });

  it('warns on invalid keys', () => {
    const result = parseEnvContent('123bad=value', 'test.env');
    expect(result.entries).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('invalid key');
  });

  it('strips BOM', () => {
    const result = parseEnvContent('\uFEFFKEY=value', 'test.env');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.name).toBe('KEY');
  });

  it('normalizes CRLF', () => {
    const result = parseEnvContent('A=1\r\nB=2\r\nC=3', 'test.env');
    expect(result.entries.map((e) => e.name)).toEqual(['A', 'B', 'C']);
  });

  it('normalizes lone CR', () => {
    const result = parseEnvContent('A=1\rB=2', 'test.env');
    expect(result.entries.map((e) => e.name)).toEqual(['A', 'B']);
  });

  it('warns on unterminated multi-line quote', () => {
    const result = parseEnvContent('KEY="unterminated', 'test.env');
    expect(result.warnings.some((w) => w.includes('Unterminated'))).toBe(true);
  });

  it('accepts dotted and dashed variable names', () => {
    const result = parseEnvContent('DB.HOST=localhost\nAPP-NAME=test', 'test.env');
    expect(result.entries.map((e) => e.name)).toEqual(['DB.HOST', 'APP-NAME']);
  });

  it('ignores inline comments on their own (values are not parsed)', () => {
    const result = parseEnvContent('KEY=value # inline comment', 'test.env');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.name).toBe('KEY');
  });
});