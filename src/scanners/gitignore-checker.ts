/**
 * SecretScope — .gitignore and Git tracking checker.
 *
 * Checks three things for each configured sensitive file:
 *   1. Does the file exist on disk?
 *   2. Is it matched by .gitignore? (via the `ignore` package)
 *   3. Is it currently tracked by Git? (via `git ls-files`)
 *
 * Hard invariants:
 *   - Never modifies .gitignore.
 *   - Never modifies Git state (no add, no rm, no restore).
 *   - Git commands have a timeout and never inherit a shell.
 *   - If Git is not available, the tracked-file check is skipped
 *     with a warning, not an error.
 */

import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ignore from 'ignore';

import type { Finding } from '../core/types.js';
import { fileExists, readTextFile } from '../utils/fs-safe.js';

const execFileAsync = promisify(execFile);

/** Files checked by default when the caller does not override. */
export const DEFAULT_FILES_TO_CHECK = ['.env'] as const;

/** Upper bound on bytes read from .gitignore. */
const GITIGNORE_MAX_BYTES = 256 * 1024;

/** Default timeout for git commands (5 seconds). */
const DEFAULT_GIT_TIMEOUT_MS = 5000;

export interface GitignoreCheckerOptions {
  /** Project root. */
  root: string;
  /** Relative paths to check. Defaults to DEFAULT_FILES_TO_CHECK. */
  filesToCheck?: readonly string[];
  /** Timeout for git commands in ms. Defaults to 5000. */
  gitTimeoutMs?: number;
}

export interface GitignoreCheckResult {
  findings: Finding[];
  warnings: string[];
  /** True if at least one Git command succeeded. */
  gitAvailable: boolean;
}

export class GitignoreChecker {
  private readonly root: string;
  private readonly filesToCheck: readonly string[];
  private readonly gitTimeoutMs: number;

  constructor(options: GitignoreCheckerOptions) {
    this.root = options.root;
    this.filesToCheck = options.filesToCheck ?? DEFAULT_FILES_TO_CHECK;
    this.gitTimeoutMs = options.gitTimeoutMs ?? DEFAULT_GIT_TIMEOUT_MS;
  }

  async check(): Promise<GitignoreCheckResult> {
    const findings: Finding[] = [];
    const warnings: string[] = [];
    let gitAvailable = false;

    // Load .gitignore once (if present).
    const gitignorePath = join(this.root, '.gitignore');
    const hasGitignore = await fileExists(gitignorePath);
    let matcher: ReturnType<typeof ignore> | null = null;

    if (hasGitignore) {
      try {
        const { content } = await readTextFile(gitignorePath, {
          maxBytes: GITIGNORE_MAX_BYTES,
        });
        matcher = ignore().add(content);
      } catch (err) {
        warnings.push(
          `Failed to read .gitignore: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    for (const relFile of this.filesToCheck) {
      const absFile = join(this.root, relFile);
      const exists = await fileExists(absFile);
      if (!exists) continue;

      const displayPath = relFile.split('\\').join('/');

      if (!hasGitignore) {
        findings.push({
          ruleId: 'GITIGNORE_MISSING',
          category: 'gitignore-risk',
          severity: 'error',
          message: `${displayPath} exists but no .gitignore was found. It may be committed.`,
          location: { file: displayPath, line: 1 },
        });
      } else if (matcher !== null && !matcher.ignores(displayPath)) {
        findings.push({
          ruleId: 'GITIGNORE_NOT_COVERING_ENV',
          category: 'gitignore-risk',
          severity: 'error',
          message: `${displayPath} exists but is not covered by .gitignore.`,
          location: { file: '.gitignore', line: 1 },
        });
      }

      const tracked = await this.isTracked(relFile);
      if (tracked === true) {
        gitAvailable = true;
        findings.push({
          ruleId: 'ENV_TRACKED_IN_GIT',
          category: 'gitignore-risk',
          severity: 'error',
          message:
            `${displayPath} is tracked by Git. Secrets in it may already ` +
            `have leaked. Consider removing it from tracking and ` +
            `rotating any affected credentials.`,
          location: { file: displayPath, line: 1 },
        });
      } else if (tracked === false) {
        gitAvailable = true;
      } else {
        // tracked === null: git not available or errored.
        warnings.push(
          `Could not determine if ${displayPath} is tracked by Git ` +
            `(git may not be installed, or ${this.root} is not a Git ` +
            `repository).`,
        );
      }
    }

    return { findings, warnings, gitAvailable };
  }

  /**
   * Returns:
   *   true  -> file is tracked
   *   false -> file is not tracked
   *   null  -> git unavailable or command failed for other reasons
   */
  private async isTracked(relFile: string): Promise<boolean | null> {
    try {
      await execFileAsync(
        'git',
        ['ls-files', '--error-unmatch', '--', relFile],
        {
          cwd: this.root,
          timeout: this.gitTimeoutMs,
          windowsHide: true,
        },
      );
      return true;
    } catch (err) {
      const code = (err as { code?: number | string }).code;
      // Exit code 1 from `git ls-files --error-unmatch` means "not tracked".
      if (code === 1) return false;
      // git not installed, cwd not a repo, timeout, etc.
      return null;
    }
  }
}