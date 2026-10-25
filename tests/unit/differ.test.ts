import { describe, expect, it } from 'vitest';

import { compareEnvironment } from '../../src/core/differ.js';

describe('compareEnvironment', () => {
  it('produces no findings when everything matches', () => {
    const result = compareEnvironment({
      envEntries: [{ name: 'API_KEY', file: '.env', line: 1 }],
      envExampleEntries: [{ name: 'API_KEY', file: '.env.example', line: 1 }],
      codeReferences: [
        { name: 'API_KEY', file: 'src/index.ts', line: 5, via: 'process.env' },
      ],
    });
    expect(result.findings).toEqual([]);
    expect(result.counts).toEqual({ missing: 0, unused: 0, undocumented: 0 });
  });

  it('reports missing variables (in code, not in .env)', () => {
    const result = compareEnvironment({
      envEntries: [],
      envExampleEntries: [],
      codeReferences: [
        { name: 'MISSING', file: 'src/a.ts', line: 10, via: 'process.env' },
      ],
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.ruleId).toBe('ENV_VAR_MISSING');
    expect(result.findings[0]?.category).toBe('missing-env-var');
    expect(result.findings[0]?.severity).toBe('warning');
    expect(result.findings[0]?.location).toMatchObject({
      file: 'src/a.ts',
      line: 10,
    });
    expect(result.counts).toEqual({ missing: 1, unused: 0, undocumented: 0 });
  });

  it('reports unused variables (in .env, not in code)', () => {
    const result = compareEnvironment({
      envEntries: [{ name: 'UNUSED', file: '.env', line: 3 }],
      envExampleEntries: [{ name: 'UNUSED', file: '.env.example', line: 1 }],
      codeReferences: [],
    });
    const unused = result.findings.filter(
      (f) => f.category === 'unused-env-var',
    );
    expect(unused).toHaveLength(1);
    expect(unused[0]?.ruleId).toBe('ENV_VAR_UNUSED');
    expect(unused[0]?.location).toMatchObject({ file: '.env', line: 3 });
    expect(result.counts).toEqual({ missing: 0, unused: 1, undocumented: 0 });
  });

  it('reports undocumented variables (in .env, not in .env.example)', () => {
    const result = compareEnvironment({
      envEntries: [{ name: 'HIDDEN', file: '.env', line: 3 }],
      envExampleEntries: [],
      codeReferences: [
        { name: 'HIDDEN', file: 'src/a.ts', line: 5, via: 'process.env' },
      ],
    });
    const undocumented = result.findings.filter(
      (f) => f.category === 'undocumented-env-var',
    );
    expect(undocumented).toHaveLength(1);
    expect(undocumented[0]?.ruleId).toBe('ENV_VAR_UNDOCUMENTED');
    expect(result.counts).toEqual({ missing: 0, unused: 0, undocumented: 1 });
  });

  it('combines multiple categories for the same variable', () => {
    // UNUSED is in .env but not in code and not in .env.example:
    // it should produce both an "unused" and an "undocumented" finding.
    const result = compareEnvironment({
      envEntries: [{ name: 'UNUSED', file: '.env', line: 1 }],
      envExampleEntries: [],
      codeReferences: [],
    });
    const categories = result.findings.map((f) => f.category).sort();
    expect(categories).toEqual(['undocumented-env-var', 'unused-env-var']);
    expect(result.counts).toEqual({ missing: 0, unused: 1, undocumented: 1 });
  });

  it('includes metadata with reference count and files', () => {
    const result = compareEnvironment({
      envEntries: [],
      envExampleEntries: [],
      codeReferences: [
        { name: 'X', file: 'src/a.ts', line: 1, via: 'process.env' },
        { name: 'X', file: 'src/b.ts', line: 2, via: 'process.env' },
      ],
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.metadata?.referenceCount).toBe(2);
    expect(result.findings[0]?.metadata?.referencedIn).toBe(
      'src/a.ts, src/b.ts',
    );
  });

  it('does not include env values in findings', () => {
    const result = compareEnvironment({
      envEntries: [{ name: 'SECRET_VAR', file: '.env', line: 1 }],
      envExampleEntries: [],
      codeReferences: [],
    });
    const serialized = JSON.stringify(result.findings);
    expect(serialized).toContain('SECRET_VAR');
    // EnvVarEntry has no `value` field by design.
    expect(serialized).not.toContain('=');
  });

  it('handles empty inputs gracefully', () => {
    const result = compareEnvironment({
      envEntries: [],
      envExampleEntries: [],
      codeReferences: [],
    });
    expect(result.findings).toEqual([]);
    expect(result.counts).toEqual({ missing: 0, unused: 0, undocumented: 0 });
  });
});