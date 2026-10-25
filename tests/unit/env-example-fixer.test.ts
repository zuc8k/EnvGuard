import { describe, expect, it } from 'vitest';

import {
  buildUpdatedContent,
  collectExistingNames,
  FIX_SECTION_MARKER,
  proposeFix,
} from '../../src/fixers/env-example-fixer.js';

describe('collectExistingNames', () => {
  it('collects variable names at line start', () => {
    const names = collectExistingNames('A=1\nB=2\nC=');
    expect(names).toEqual(new Set(['A', 'B', 'C']));
  });

  it('handles export prefix', () => {
    const names = collectExistingNames('export A=1\nexport B=2');
    expect(names).toEqual(new Set(['A', 'B']));
  });

  it('ignores comments and blank lines', () => {
    const names = collectExistingNames('# comment\n\nA=1\n# B=2');
    expect(names).toEqual(new Set(['A']));
  });

  it('handles CRLF', () => {
    const names = collectExistingNames('A=1\r\nB=2');
    expect(names).toEqual(new Set(['A', 'B']));
  });

  it('accepts dotted and dashed names', () => {
    const names = collectExistingNames('DB.HOST=x\nAPP-NAME=y');
    expect(names).toEqual(new Set(['DB.HOST', 'APP-NAME']));
  });
});

describe('buildUpdatedContent', () => {
  it('returns existing content when nothing to add', () => {
    const existing = 'A=1\n';
    expect(buildUpdatedContent(existing, [])).toBe(existing);
  });

  it('appends a marked section with exactly one blank line before marker', () => {
    const existing = 'FOO=bar\n';
    const updated = buildUpdatedContent(existing, ['B', 'C']);
    expect(updated).toContain(FIX_SECTION_MARKER);
    expect(updated).toContain('B=');
    expect(updated).toContain('C=');
    // Exactly one blank line (two newlines) before the marker:
    expect(updated).toContain(`bar\n\n${FIX_SECTION_MARKER}`);
    // And the section is preceded by the existing content:
    expect(updated.startsWith('FOO=bar\n\n')).toBe(true);
  });

  it('preserves CRLF line endings throughout', () => {
    const existing = 'A=1\r\n';
    const updated = buildUpdatedContent(existing, ['B']);
    expect(updated).toContain('\r\n');
    // No bare LF anywhere:
    expect(/[^\r]\n/.test(updated)).toBe(false);
  });

  it('does not add leading blank lines for an empty file', () => {
    const updated = buildUpdatedContent('', ['A']);
    expect(updated.startsWith(FIX_SECTION_MARKER)).toBe(true);
    expect(updated).toContain('A=');
  });
});

describe('proposeFix', () => {
  it('adds missing variables and skips existing ones', () => {
    const result = proposeFix({
      examplePath: '/tmp/.env.example',
      existingContent: 'A=1\n',
      missingVars: ['A', 'B', 'C'],
      apply: false,
    });
    expect(result.added).toEqual(['B', 'C']);
    expect(result.applied).toBe(false);
    expect(result.updatedContent).toContain('B=');
    expect(result.updatedContent).toContain('C=');
    expect(result.updatedContent).not.toMatch(/^A=1\nA=/m);
  });

  it('does not set applied=true when apply=false', () => {
    const result = proposeFix({
      examplePath: '/tmp/.env.example',
      existingContent: 'A=1\n',
      missingVars: ['B'],
      apply: false,
    });
    expect(result.applied).toBe(false);
  });

  it('sets applied=true when apply=true', () => {
    const result = proposeFix({
      examplePath: '/tmp/.env.example',
      existingContent: 'A=1\n',
      missingVars: ['B'],
      apply: true,
    });
    expect(result.applied).toBe(true);
  });

  it('deduplicates the missing list', () => {
    const result = proposeFix({
      examplePath: '/tmp/.env.example',
      existingContent: '',
      missingVars: ['A', 'A', 'B', 'B'],
      apply: false,
    });
    expect(result.added).toEqual(['A', 'B']);
  });

  it('skips invalid variable names with a warning', () => {
    const result = proposeFix({
      examplePath: '/tmp/.env.example',
      existingContent: '',
      missingVars: ['GOOD_VAR', '123BAD', ''],
      apply: false,
    });
    expect(result.added).toEqual(['GOOD_VAR']);
    expect(result.warnings.length).toBe(2);
  });

  it('returns empty result when all requested vars are already present', () => {
    const result = proposeFix({
      examplePath: '/tmp/.env.example',
      existingContent: 'A=1\nB=2\n',
      missingVars: ['A', 'B'],
      apply: false,
    });
    expect(result.added).toEqual([]);
    expect(result.updatedContent).toBe('');
    expect(result.applied).toBe(false);
  });

  it('does not modify content when apply=false (pure function)', () => {
    const existing = 'A=1\n';
    proposeFix({
      examplePath: '/tmp/.env.example',
      existingContent: existing,
      missingVars: ['B'],
      apply: false,
    });
    // No filesystem access happens here; verifying the input is unchanged.
    expect(existing).toBe('A=1\n');
  });
});