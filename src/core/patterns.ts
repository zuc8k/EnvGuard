/**
 * SecretScope — Shared pattern constants.
 *
 * These constants are used by the file resolver (now) and by
 * individual scanners (later). They contain no logic.
 */

/**
 * Directories that are never scanned by default, at any depth.
 * Users can override with explicit --include patterns.
 */
export const DEFAULT_IGNORE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.vitest',
  'vendor',
  'target',
] as const;

/**
 * Common .env file names. Used by the file resolver to locate
 * environment files without requiring the user to list them.
 *
 * `.env.example` and `.env.template` are intentionally included
 * because they are safe to commit and useful for comparison.
 */
export const ENV_FILE_NAMES = [
  '.env',
  '.env.example',
  '.env.sample',
  '.env.template',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.test',
  '.env.production',
  '.env.production.local',
] as const;

/**
 * File extensions treated as source code by the analyzer.
 */
export const SOURCE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
] as const;