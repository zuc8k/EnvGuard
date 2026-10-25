/**
 * SecretScope — Scan orchestrator.
 *
 * Coordinates the individual scanners, combines their findings into
 * a single ScanReport, and produces a deterministic output.
 *
 * Efficiency note: each file is read once, and the content is
 * reused for multiple purposes (env parsing + secret scanning for
 * env files; AST analysis + secret scanning for source files).
 * This avoids redundant I/O on large projects.
 *
 * Error handling: a failure to read or parse a single file is
 * recorded as a warning, not a fatal error. Only failure to access
 * the project root aborts the scan.
 */

import { basename } from 'node:path';

import type {
  CodeReference,
  EnvVarEntry,
  Finding,
  ScanReport,
  ScanSummary,
} from './types.js';
import { compareEnvironment } from './differ.js';
import { CodeAnalyzer } from '../scanners/code-analyzer.js';
import { parseEnvContent } from '../scanners/env-parser.js';
import { SecretScanner } from '../scanners/secret-scanner.js';
import { GitignoreChecker } from '../scanners/gitignore-checker.js';
import { findEnvFiles, findSourceFiles } from '../utils/file-resolver.js';
import { dirExists, readTextFile, toRelativePath } from '../utils/fs-safe.js';

/**
 * Tool identity. VERSION must be updated with each release and kept
 * in sync with package.json "version". This constant is the single
 * source of truth for the version reported in JSON and SARIF output.
 */
export const TOOL_NAME = 'secretscope';
export const VERSION = '0.1.0';

/** Env-file basenames treated as "example" (safe to commit). */
const EXAMPLE_ENV_BASENAMES: ReadonlySet<string> = new Set([
  '.env.example',
  '.env.sample',
  '.env.template',
]);

export interface ScanOptions {
  /** Absolute project root. */
  root: string;
  /** Additional glob patterns to exclude (on top of defaults). */
  exclude?: string[];
  /** Maximum bytes per file. Defaults to fs-safe default (1 MiB). */
  maxFileSize?: number;
}

export class Scanner {
  /**
   * Runs a full scan and returns a ScanReport.
   * Throws only if the root directory does not exist.
   */
  async scan(options: ScanOptions): Promise<ScanReport> {
    const warnings: string[] = [];
    const root = options.root;
    const maxFileSize = options.maxFileSize;
    const exclude = options.exclude ?? [];

    if (!(await dirExists(root))) {
      throw new Error(`Root directory does not exist: ${root}`);
    }

    // 1. Discover files
    const allEnvFiles = await findEnvFiles(root, { exclude });
    const envFiles: string[] = [];
    const envExampleFiles: string[] = [];
    for (const file of allEnvFiles) {
      if (EXAMPLE_ENV_BASENAMES.has(basename(file))) {
        envExampleFiles.push(file);
      } else {
        envFiles.push(file);
      }
    }

    const sourceFiles = await findSourceFiles(root, { exclude });

    if (sourceFiles.length === 0 && envFiles.length > 0) {
      warnings.push(
        'No TypeScript/JavaScript source files were found. ' +
          '"unused-env-var" findings may be false positives if this ' +
          'project is not written in JavaScript/TypeScript.',
      );
    }

    // 2. Prepare shared helpers
    const readOptions =
      maxFileSize !== undefined ? { maxBytes: maxFileSize } : {};
    const secretScanner = new SecretScanner({ root });
    const analyzer = new CodeAnalyzer({ root });

    const envEntries: EnvVarEntry[] = [];
    const envExampleEntries: EnvVarEntry[] = [];
    const codeReferences: CodeReference[] = [];
    const secretFindings: Finding[] = [];

    // 3. Parse env files and scan them for secrets
    for (const file of envFiles) {
      const displayPath = toRelativePath(root, file);
      try {
        const { content } = await readTextFile(file, readOptions);
        const parsed = parseEnvContent(content, displayPath);
        envEntries.push(...parsed.entries);
        warnings.push(...parsed.warnings);

        const secretResult = secretScanner.scanContent(content, displayPath);
        secretFindings.push(...secretResult.findings);
        warnings.push(...secretResult.warnings);
      } catch (err) {
        warnings.push(`Failed to read ${displayPath}: ${errorMessage(err)}`);
      }
    }

    for (const file of envExampleFiles) {
      const displayPath = toRelativePath(root, file);
      try {
        const { content } = await readTextFile(file, readOptions);
        const parsed = parseEnvContent(content, displayPath);
        envExampleEntries.push(...parsed.entries);
        warnings.push(...parsed.warnings);

        const secretResult = secretScanner.scanContent(content, displayPath);
        secretFindings.push(...secretResult.findings);
        warnings.push(...secretResult.warnings);
      } catch (err) {
        warnings.push(`Failed to read ${displayPath}: ${errorMessage(err)}`);
      }
    }

    // 4. Analyze source files and scan them for secrets
    for (const file of sourceFiles) {
      const displayPath = toRelativePath(root, file);
      try {
        const { content } = await readTextFile(file, readOptions);

        const analysis = analyzer.analyze(file, content);
        codeReferences.push(...analysis.references);
        warnings.push(...analysis.warnings);

        const secretResult = secretScanner.scanContent(content, displayPath);
        secretFindings.push(...secretResult.findings);
        warnings.push(...secretResult.warnings);
      } catch (err) {
        warnings.push(`Failed to analyze ${displayPath}: ${errorMessage(err)}`);
      }
    }

    // 5. Check .gitignore and Git tracking
    const gitignoreResult = await new GitignoreChecker({ root }).check();
    warnings.push(...gitignoreResult.warnings);

    // 6. Compare environments
    const differResult = compareEnvironment({
      envEntries,
      envExampleEntries,
      codeReferences,
    });

    // 7. Combine findings
    const findings: Finding[] = [
      ...differResult.findings,
      ...secretFindings,
      ...gitignoreResult.findings,
    ];

    // 8. Build summary
    const summary: ScanSummary = {
      filesScanned:
        sourceFiles.length + envFiles.length + envExampleFiles.length,
      envVarsFound: new Set(envEntries.map((entry) => entry.name)).size,
      codeRefsFound: codeReferences.length,
      findings: findings.length,
      bySeverity: {
        error: findings.filter((f) => f.severity === 'error').length,
        warning: findings.filter((f) => f.severity === 'warning').length,
        info: findings.filter((f) => f.severity === 'info').length,
      },
    };

    return {
      tool: { name: TOOL_NAME, version: VERSION },
      generatedAt: new Date().toISOString(),
      root,
      summary,
      findings,
      warnings,
    };
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}