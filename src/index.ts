/**
 * SecretScope — Public library API.
 *
 * Everything exported here is considered stable for the 0.1.x line.
 * Internal utilities that are not exported may change without notice.
 */

// Tool metadata and main orchestrator
export { TOOL_NAME, VERSION, Scanner } from './core/scanner.js';
export type { ScanOptions } from './core/scanner.js';

// Core types
export type {
  Severity,
  FindingCategory,
  Finding,
  SourceLocation,
  EnvVarEntry,
  CodeReference,
  SecretRule,
  ScanSummary,
  ScanReport,
} from './core/types.js';

// Core utilities
export {
  maskValue,
  ensureMasked,
  isLikelyMasked,
  redactText,
} from './core/redactor.js';
export type { MaskOptions } from './core/redactor.js';

export { compareEnvironment } from './core/differ.js';
export type { DifferInput, DifferResult } from './core/differ.js';

// Scanners
export {
  parseEnvContent,
  parseEnvFile,
} from './scanners/env-parser.js';
export type {
  EnvParseResult,
  ParseEnvFileOptions,
} from './scanners/env-parser.js';

export { CodeAnalyzer } from './scanners/code-analyzer.js';
export type {
  CodeAnalyzerOptions,
  CodeAnalysisResult,
} from './scanners/code-analyzer.js';

export { SecretScanner } from './scanners/secret-scanner.js';
export type {
  SecretScannerOptions,
  SecretScanResult,
} from './scanners/secret-scanner.js';

export {
  GitignoreChecker,
  DEFAULT_FILES_TO_CHECK,
} from './scanners/gitignore-checker.js';
export type {
  GitignoreCheckerOptions,
  GitignoreCheckResult,
} from './scanners/gitignore-checker.js';

// Reporters
export { formatConsoleReport } from './reporters/console-reporter.js';
export type { ConsoleReporterOptions } from './reporters/console-reporter.js';

export { formatJsonReport } from './reporters/json-reporter.js';
export type { JsonReporterOptions } from './reporters/json-reporter.js';

export {
  formatSarifReport,
  buildSarifLog,
} from './reporters/sarif-reporter.js';

// Rules
export { SECRET_RULES, rulesApplicableToPath } from './rules/secrets.js';

// Utilities
export {
  readTextFile,
  fileExists,
  dirExists,
  toRelativePath,
  FileTooLargeError,
} from './utils/fs-safe.js';
export type { ReadOptions, ReadResult } from './utils/fs-safe.js';

export {
  findFiles,
  findEnvFiles,
  findSourceFiles,
} from './utils/file-resolver.js';
export type { ResolveOptions } from './utils/file-resolver.js';

export { Logger } from './utils/logger.js';
export type { LoggerOptions, LogLevel } from './utils/logger.js';