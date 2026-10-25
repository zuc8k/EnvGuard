/**
 * SecretScope — Core type definitions.
 *
 * This file contains only type declarations. No runtime logic.
 * All other modules import from here.
 */

/** Severity of a single finding. */
export type Severity = 'info' | 'warning' | 'error';

/** High-level category of a finding. */
export type FindingCategory =
  | 'missing-env-var'
  | 'unused-env-var'
  | 'undocumented-env-var'
  | 'secret-pattern'
  | 'gitignore-risk';

/** Where a finding was observed. */
export interface SourceLocation {
  /** Absolute path on disk. Reporters convert this to a relative path. */
  file: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column number, optional. */
  column?: number;
  /** Short snippet, already masked. Never contains raw secrets. */
  snippet?: string;
}

/** A single finding produced by any scanner. */
export interface Finding {
  /** Stable rule identifier, e.g. "SECRET_AWS_ACCESS_KEY". */
  ruleId: string;
  category: FindingCategory;
  severity: Severity;
  /** Human-readable message. Must not contain raw secret values. */
  message: string;
  /** Where the finding was observed, if applicable. */
  location?: SourceLocation;
  /** Value already passed through maskValue(). */
  maskedValue?: string;
  /** Additional metadata. Must never contain secrets. */
  metadata?: Record<string, string | number | boolean>;
}

/** A variable declared in a .env or .env.example file. */
export interface EnvVarEntry {
  name: string;
  file: string;
  line?: number;
}

/** A reference to an environment variable inside source code. */
export interface CodeReference {
  name: string;
  file: string;
  line: number;
  column?: number;
  via: 'process.env' | 'import.meta.env' | 'destructuring';
}

/** A secret-detection rule definition. */
export interface SecretRule {
  id: string;
  description: string;
  severity: Severity;
  pattern: RegExp;
  /**
   * Optional capture group index used to extract the secret value
   * for masking. Defaults to the full match (index 0).
   */
  valueGroup?: number;
  /**
   * Optional glob patterns (relative to project root) where this rule
   * should be applied. Empty or undefined means "apply everywhere".
   */
  filePatterns?: string[];
}

/** Counters produced by a full scan. */
export interface ScanSummary {
  filesScanned: number;
  envVarsFound: number;
  codeRefsFound: number;
  findings: number;
  bySeverity: Record<Severity, number>;
}

/** The complete report returned by the scanner. */
export interface ScanReport {
  tool: {
    name: string;
    version: string;
  };
  generatedAt: string;
  /** Absolute path to the scanned root. */
  root: string;
  summary: ScanSummary;
  findings: Finding[];
  /** Non-fatal warnings for the user. */
  warnings: string[];
}