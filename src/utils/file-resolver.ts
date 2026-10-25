/**
 * SecretScope — File discovery.
 *
 * All file discovery in SecretScope goes through this module so that
 * ignore rules, sorting, and dotfile handling are consistent across
 * scanners.
 *
 * Symlinks are NOT followed by default to avoid escaping the project
 * root and to avoid infinite loops.
 */

import fg from 'fast-glob';
import { resolve } from 'node:path';
import { DEFAULT_IGNORE_DIRS, ENV_FILE_NAMES, SOURCE_EXTENSIONS } from '../core/patterns.js';

export interface ResolveOptions {
  /**
   * Additional glob patterns to exclude, on top of DEFAULT_IGNORE_DIRS.
   * Patterns are matched against paths relative to `root`.
   */
  exclude?: string[];
  /**
   * Match files whose name starts with a dot. Defaults to false.
   * `findEnvFiles` forces this to true.
   */
  dot?: boolean;
  /**
   * Follow symbolic links. Defaults to false.
   */
  followSymlinks?: boolean;
}

/**
 * Builds the ignore list passed to fast-glob.
 * Always includes DEFAULT_IGNORE_DIRS, plus user-provided excludes.
 * Duplicates are removed to keep the ignore list small.
 */
function buildIgnorePatterns(options: ResolveOptions): string[] {
  const patterns = new Set<string>();
  for (const dir of DEFAULT_IGNORE_DIRS) {
    patterns.add(`**/${dir}/**`);
  }
  if (options.exclude) {
    for (const p of options.exclude) {
      patterns.add(p);
    }
  }
  return [...patterns];
}

/**
 * Finds files under `root` that match the given glob patterns,
 * applying default ignores and user excludes. Returns absolute paths
 * sorted lexicographically for deterministic output.
 */
export async function findFiles(
  root: string,
  patterns: string[],
  options: ResolveOptions = {},
): Promise<string[]> {
  if (patterns.length === 0) return [];

  const absoluteRoot = resolve(root);
  const matches = await fg(patterns, {
    cwd: absoluteRoot,
    ignore: buildIgnorePatterns(options),
    absolute: true,
    onlyFiles: true,
    dot: options.dot === true,
    followSymbolicLinks: options.followSymlinks === true,
  });

  return matches.sort();
}

/**
 * Locates common .env files anywhere under `root`.
 * Dotfiles are enabled because .env files start with a dot.
 */
export async function findEnvFiles(
  root: string,
  options: ResolveOptions = {},
): Promise<string[]> {
  const patterns = ENV_FILE_NAMES.map((name) => `**/${name}`);
  return findFiles(root, patterns, { ...options, dot: true });
}

/**
 * Locates source files (TypeScript and JavaScript) under `root`.
 * Dotfiles are NOT enabled by default, because configuration files
 * such as `.eslintrc.js` are not relevant to env-var analysis.
 */
export async function findSourceFiles(
  root: string,
  options: ResolveOptions = {},
): Promise<string[]> {
  const patterns = SOURCE_EXTENSIONS.map((ext) => `**/*${ext}`);
  return findFiles(root, patterns, options);
}