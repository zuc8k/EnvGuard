/**
 * SecretScope — ts-morph Project factory.
 *
 * Centralizes the Project configuration so every scanner that needs
 * to parse TypeScript/JavaScript uses the same safe, fast defaults.
 *
 * Configuration choices and why:
 *   - useInMemoryFileSystem: true
 *       We pass file content directly (already read via fs-safe).
 *       Nothing is ever written to disk.
 *   - skipAddingFilesFromTsConfig: true
 *       The caller decides which files to analyze. We must NOT
 *       implicitly scan the user's whole tsconfig project.
 *   - skipFileDependencyResolution: true
 *       We do not follow imports. AST-only analysis.
 *   - skipLoadingLibFiles: true
 *       Skips loading the TypeScript stdlib, which we never need.
 *   - allowJs: true
 *       Parse .js/.jsx/.mjs/.cjs as source, not as data.
 *   - noResolve / skipLibCheck / noEmit
 *       Disable everything we do not use, to keep parsing cheap.
 */

import { Project } from 'ts-morph';

export function createAstProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
    compilerOptions: {
      allowJs: true,
      noResolve: true,
      skipLibCheck: true,
      noEmit: true,
    },
  });
}